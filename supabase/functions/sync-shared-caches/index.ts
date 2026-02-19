import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SharedCacheOutput {
  shared_cache_id: string;
  shared_cache_name: string;
  enabled: boolean;
}

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  config?: {
    sharedCacheOutputs?: SharedCacheOutput[];
    [key: string]: unknown;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { workflow_id, company_id, shared_cache_ids } = await req.json();

    if (!workflow_id || !company_id) {
      return new Response(
        JSON.stringify({ error: 'workflow_id and company_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-shared-caches] Starting sync for workflow ${workflow_id}, company ${company_id}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load workflow nodes
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('nodes, name')
      .eq('id', workflow_id)
      .single();

    if (workflowError || !workflow) {
      console.error('[sync-shared-caches] Failed to load workflow:', workflowError);
      return new Response(
        JSON.stringify({ error: 'Failed to load workflow', details: workflowError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const nodes = workflow.nodes as WorkflowNode[];
    const syncedCaches: string[] = [];
    const errors: string[] = [];
    let nodesProcessed = 0;

    // Process each node that has sharedCacheOutputs configured
    for (const node of nodes) {
      if (!node.config?.sharedCacheOutputs || !Array.isArray(node.config.sharedCacheOutputs)) {
        continue;
      }

      // Get existing node output from company_node_data
      const { data: nodeData, error: nodeError } = await supabase
        .from('company_node_data')
        .select('data, content_hash, version')
        .match({ company_id, workflow_id, node_id: node.id })
        .single();

      if (nodeError || !nodeData) {
        console.log(`[sync-shared-caches] No data found for node ${node.label || node.id}`);
        continue;
      }

      // Check if there's actual output to sync
      if (!nodeData.data?.output) {
        console.log(`[sync-shared-caches] Node ${node.label} has no output to sync`);
        continue;
      }

      nodesProcessed++;

      // Sync to each configured cache
      for (const cacheConfig of node.config.sharedCacheOutputs) {
        if (!cacheConfig.enabled || !cacheConfig.shared_cache_id) {
          continue;
        }

        // If shared_cache_ids filter is provided, only sync matching caches
        if (shared_cache_ids && Array.isArray(shared_cache_ids) && shared_cache_ids.length > 0) {
          if (!shared_cache_ids.includes(cacheConfig.shared_cache_id)) {
            continue;
          }
        }

        console.log(`[sync-shared-caches] Syncing ${node.label} → ${cacheConfig.shared_cache_name}`);

        const { error: upsertError } = await supabase
          .from('shared_cache_data')
          .upsert({
            shared_cache_id: cacheConfig.shared_cache_id,
            company_id,
            workflow_id,
            node_id: node.id,
            node_label: node.label || node.type,
            data: nodeData.data,
            content_hash: nodeData.content_hash,
            version: nodeData.version || 1,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'shared_cache_id,company_id,workflow_id,node_id'
          });

        if (upsertError) {
          console.error(`[sync-shared-caches] Failed to sync cache ${cacheConfig.shared_cache_name}:`, upsertError);
          errors.push(`${cacheConfig.shared_cache_name}: ${upsertError.message}`);
        } else {
          syncedCaches.push(cacheConfig.shared_cache_name);
          console.log(`[sync-shared-caches] Successfully synced: ${cacheConfig.shared_cache_name}`);
        }
      }
    }

    console.log(`[sync-shared-caches] Complete. Processed ${nodesProcessed} nodes, synced ${syncedCaches.length} caches`);

    return new Response(
      JSON.stringify({
        success: true,
        synced: syncedCaches,
        nodes_processed: nodesProcessed,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[sync-shared-caches] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
