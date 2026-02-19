import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Verify user is authenticated
    const userClient = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: authError } = await userClient.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { id: workflowId } = await req.json();

    if (!workflowId) {
      return new Response(
        JSON.stringify({ error: 'Workflow ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role for cascade deletion
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify workflow exists
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, name')
      .eq('id', workflowId)
      .maybeSingle();

    if (workflowError || !workflow) {
      return new Response(
        JSON.stringify({ error: 'Workflow not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting cascade delete for workflow: ${workflow.name} (${workflowId})`);

    // 1. Delete company_node_data
    const { error: e1 } = await supabase
      .from('company_node_data')
      .delete()
      .eq('workflow_id', workflowId);
    if (e1) console.error('Error deleting company_node_data:', e1);

    // 2. Delete entity_node_data
    const { error: e2 } = await supabase
      .from('entity_node_data')
      .delete()
      .eq('workflow_id', workflowId);
    if (e2) console.error('Error deleting entity_node_data:', e2);

    // 3. Delete evaluation_history
    const { error: e3 } = await supabase
      .from('evaluation_history')
      .delete()
      .eq('workflow_id', workflowId);
    if (e3) console.error('Error deleting evaluation_history:', e3);

    // 4. Get execution_runs to delete their steps first
    const { data: runs } = await supabase
      .from('execution_runs')
      .select('id')
      .eq('workflow_id', workflowId);

    if (runs && runs.length > 0) {
      const runIds = runs.map(r => r.id);
      
      // 4a. Delete execution_steps
      const { error: e4a } = await supabase
        .from('execution_steps')
        .delete()
        .in('execution_run_id', runIds);
      if (e4a) console.error('Error deleting execution_steps:', e4a);
    }

    // 5. Delete execution_runs
    const { error: e5 } = await supabase
      .from('execution_runs')
      .delete()
      .eq('workflow_id', workflowId);
    if (e5) console.error('Error deleting execution_runs:', e5);

    // 6. Delete company_ingest_schemas
    const { error: e6 } = await supabase
      .from('company_ingest_schemas')
      .delete()
      .eq('workflow_id', workflowId);
    if (e6) console.error('Error deleting company_ingest_schemas:', e6);

    // 7. Delete master_node_data
    const { error: e7 } = await supabase
      .from('master_node_data')
      .delete()
      .eq('workflow_id', workflowId);
    if (e7) console.error('Error deleting master_node_data:', e7);

    // 8. Delete job_queue entries
    const { error: e8 } = await supabase
      .from('job_queue')
      .delete()
      .eq('workflow_id', workflowId);
    if (e8) console.error('Error deleting job_queue:', e8);

    // 9. Delete scheduled_jobs
    const { error: e9 } = await supabase
      .from('scheduled_jobs')
      .delete()
      .eq('workflow_id', workflowId);
    if (e9) console.error('Error deleting scheduled_jobs:', e9);

    // 10. Delete webhook_endpoints
    const { error: e10 } = await supabase
      .from('webhook_endpoints')
      .delete()
      .eq('workflow_id', workflowId);
    if (e10) console.error('Error deleting webhook_endpoints:', e10);

    // 11. Delete ai_usage_logs
    const { error: e11 } = await supabase
      .from('ai_usage_logs')
      .delete()
      .eq('workflow_id', workflowId);
    if (e11) console.error('Error deleting ai_usage_logs:', e11);

    // 12. Delete workflow_executions
    const { error: e12 } = await supabase
      .from('workflow_executions')
      .delete()
      .eq('workflow_id', workflowId);
    if (e12) console.error('Error deleting workflow_executions:', e12);

    // 13. Clear parent_id references in child workflows
    const { error: e13 } = await supabase
      .from('workflows')
      .update({ parent_id: null })
      .eq('parent_id', workflowId);
    if (e13) console.error('Error clearing parent_id:', e13);

    // 14. Clear assigned_workflow_id in companies
    const { error: e14 } = await supabase
      .from('companies')
      .update({ assigned_workflow_id: null })
      .eq('assigned_workflow_id', workflowId);
    if (e14) console.error('Error clearing assigned_workflow_id:', e14);

    // 15. Finally, delete the workflow itself
    const { error: e15 } = await supabase
      .from('workflows')
      .delete()
      .eq('id', workflowId);

    if (e15) {
      console.error('Error deleting workflow:', e15);
      return new Response(
        JSON.stringify({ error: 'Failed to delete workflow', details: e15.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully deleted workflow: ${workflow.name}`);

    return new Response(
      JSON.stringify({ success: true, deleted: workflow.name }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in delete-workflow:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
