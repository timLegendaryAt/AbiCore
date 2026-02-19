import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { entity_id } = await req.json();

    if (!entity_id) {
      throw new Error('entity_id is required');
    }

    // Fetch entity
    const { data: entity, error: entityError } = await supabase
      .from('entities')
      .select('*')
      .eq('id', entity_id)
      .single();

    if (entityError || !entity) {
      throw new Error(`Entity not found: ${entity_id}`);
    }

    // Fetch workflows assigned to this entity
    const { data: workflows, error: workflowsError } = await supabase
      .from('workflows')
      .select('*')
      .eq('settings->>data_attribution', 'entity_data')
      .eq('settings->>assigned_entity_id', entity_id);

    if (workflowsError) throw workflowsError;

    console.log(`[run-entity-workflows] Found ${workflows?.length || 0} workflows for entity ${entity.name}`);

    let workflowsProcessed = 0;

    // Process each workflow (simplified - just update node data timestamps)
    for (const workflow of workflows || []) {
      // Update entity node data to mark as executed
      await supabase
        .from('entity_node_data')
        .update({ last_executed_at: new Date().toISOString() })
        .eq('entity_id', entity_id)
        .eq('workflow_id', workflow.id);

      workflowsProcessed++;
    }

    return new Response(JSON.stringify({
      success: true,
      entity_id,
      entity_name: entity.name,
      workflows_processed: workflowsProcessed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in run-entity-workflows:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
