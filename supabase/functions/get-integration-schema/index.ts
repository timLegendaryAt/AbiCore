import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-platform-secret',
};

// Convert label to field_name (e.g., "Executive Summary" -> "executive_summary")
function toFieldName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
}

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  config: {
    isAbiOutput?: boolean;
    isAbiVCOutput?: boolean;
    [key: string]: any;
  };
}

interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate using platform secret
    const platformSecret = req.headers.get('x-platform-secret');
    const abivcSecret = Deno.env.get('ABIVC_PLATFORM_SECRET');
    const abiSecret = Deno.env.get('ABI_PLATFORM_SECRET');

    if (!platformSecret || (platformSecret !== abivcSecret && platformSecret !== abiSecret)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse query params
    const url = new URL(req.url);
    const platform = url.searchParams.get('platform') || 'all';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all workflows
    const { data: workflows, error: workflowsError } = await supabase
      .from('workflows')
      .select('id, name, nodes');

    if (workflowsError) {
      console.error('[get-integration-schema] Error fetching workflows:', workflowsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch workflows' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Scan workflows for output nodes
    const outputFields: Array<{
      key: string;
      label: string;
      workflow_id: string;
      workflow_name: string;
      node_id: string;
      node_type: string;
      platform: 'abi' | 'abivc';
    }> = [];

    for (const workflow of (workflows || []) as Workflow[]) {
      const nodes = workflow.nodes || [];
      
      for (const node of nodes) {
        const config = node.config || {};
        
        // Check for AbiVC outputs
        if ((platform === 'all' || platform === 'abivc') && config.isAbiVCOutput) {
          outputFields.push({
            key: toFieldName(node.label),
            label: node.label,
            workflow_id: workflow.id,
            workflow_name: workflow.name,
            node_id: node.id,
            node_type: node.type,
            platform: 'abivc',
          });
        }
        
        // Check for Abi outputs
        if ((platform === 'all' || platform === 'abi') && config.isAbiOutput) {
          outputFields.push({
            key: toFieldName(node.label),
            label: node.label,
            workflow_id: workflow.id,
            workflow_name: workflow.name,
            node_id: node.id,
            node_type: node.type,
            platform: 'abi',
          });
        }
      }
    }

    // Build the schema response
    const schema = {
      success: true,
      schema_version: '1.0',
      platform: 'abicore',
      inputs: {
        description: 'Data format expected when calling sync_company',
        endpoint: '/functions/v1/abicore-platform-api',
        action: 'sync_company',
        fields: [
          {
            key: 'company_uuid',
            type: 'string',
            required: true,
            description: 'UUID of the company in the source platform',
          },
          {
            key: 'company_data',
            type: 'object',
            required: true,
            description: 'Company details object',
            schema: {
              name: { type: 'string', required: true },
              industry: { type: 'string', required: false },
              location: { type: 'string', required: false },
              website: { type: 'string', required: false },
              description: { type: 'string', required: false },
              funding_stage: { type: 'string', required: false },
              employee_count: { type: 'number', required: false },
            },
          },
          {
            key: 'intake_submissions',
            type: 'array',
            required: false,
            description: 'Array of intake form responses',
            item_schema: {
              field_key: { type: 'string', required: true },
              field_label: { type: 'string', required: true },
              field_type: { type: 'string', required: true },
              value: { type: 'any', required: true },
            },
          },
          {
            key: 'metadata',
            type: 'object',
            required: false,
            description: 'Additional metadata about the sync',
          },
        ],
      },
      outputs: {
        description: 'Data sent back to the source platform after workflow execution',
        webhook_action: 'receive_output',
        fields: outputFields,
      },
      generated_at: new Date().toISOString(),
    };

    console.log('[get-integration-schema] Returning schema:', {
      platform,
      output_count: outputFields.length,
    });

    return new Response(
      JSON.stringify(schema),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[get-integration-schema] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
