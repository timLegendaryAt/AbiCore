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
    const { toolName, arguments: toolArgs } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Executing tool: ${toolName}`, toolArgs);

    let result: any;

    switch (toolName) {
      case 'get_node_schemas': {
        const { nodeType, category } = toolArgs;
        
        let query = supabase.from('node_schemas').select('*').eq('enabled', true);
        
        if (nodeType) {
          query = query.eq('type', nodeType);
        }
        if (category) {
          query = query.eq('category', category);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        result = {
          success: true,
          schemas: data,
          message: nodeType 
            ? `Found schema for ${nodeType} node type`
            : `Found ${data?.length || 0} node schemas${category ? ` in ${category} category` : ''}`
        };
        break;
      }

      case 'create_workflow_node': {
        const { workflowId, type, label, position, config } = toolArgs;
        
        // Validate node type exists
        const { data: schemaData, error: schemaError } = await supabase
          .from('node_schemas')
          .select('*')
          .eq('type', type)
          .eq('enabled', true)
          .single();
        
        if (schemaError || !schemaData) {
          throw new Error(`Invalid node type: ${type}`);
        }
        
        // Validate and enrich dataset reference if present
        if (config?.datasetId) {
          const { data: dataset, error: datasetError } = await supabase
            .from('datasets')
            .select('id, name, category')
            .eq('id', config.datasetId)
            .single();
          
          if (datasetError || !dataset) {
            throw new Error(`Invalid dataset ID: ${config.datasetId}. Please use a valid dataset ID from the available datasets list.`);
          }
          
          // Enrich config with dataset details
          config.datasetName = dataset.name;
          config.sourceType = 'dataset';
          config.source = `Dataset: ${dataset.name}`;
          
          console.log(`Node configured with dataset: ${dataset.name} (${dataset.category})`);
        }
        
        // Validate and enrich framework reference if present
        if (config?.frameworkId) {
          const { data: framework, error: frameworkError } = await supabase
            .from('frameworks')
            .select('id, name, type, schema')
            .eq('id', config.frameworkId)
            .single();
          
          if (frameworkError || !framework) {
            throw new Error(`Invalid framework ID: ${config.frameworkId}. Please use a valid framework ID from the available frameworks list.`);
          }
          
          // Enrich config with framework details
          config.frameworkName = framework.name;
          config.frameworkType = framework.type;
          config.schema = framework.schema;
          
          console.log(`Node configured with framework: ${framework.name} (${framework.type})`);
        }
        
        // Validate and enrich workflow reference if present
        if (config?.workflowId) {
          const { data: referencedWorkflow, error: workflowError } = await supabase
            .from('workflows')
            .select('id, name, description')
            .eq('id', config.workflowId)
            .single();
          
          if (workflowError || !referencedWorkflow) {
            throw new Error(`Invalid workflow ID: ${config.workflowId}. Please use a valid workflow ID from the available workflows list.`);
          }
          
          // Enrich config with workflow details
          config.workflowName = referencedWorkflow.name;
          
          console.log(`Node configured with workflow: ${referencedWorkflow.name}`);
        }
        
        // Get current workflow to update
        const { data: workflow, error: workflowError } = await supabase
          .from('workflows')
          .select('nodes, edges')
          .eq('id', workflowId)
          .single();
        
        if (workflowError) throw workflowError;
        
        // Generate new node
        const nodeId = crypto.randomUUID();
        const newNode = {
          id: nodeId,
          type,
          label,
          position: position || { 
            x: 100 + (workflow.nodes?.length || 0) * 300, 
            y: 100 
          },
          ports: [],
          config,
          errors: []
        };
        
        // Update workflow with new node
        const updatedNodes = [...(workflow.nodes || []), newNode];
        
        const { error: updateError } = await supabase
          .from('workflows')
          .update({ 
            nodes: updatedNodes,
            updated_at: new Date().toISOString()
          })
          .eq('id', workflowId);
        
        if (updateError) throw updateError;
        
        result = {
          success: true,
          nodeId,
          node: newNode,
          message: `Created ${type} node: "${label}" (ID: ${nodeId})`
        };
        break;
      }

      case 'connect_workflow_nodes': {
        const { workflowId, fromNodeId, toNodeId, fromPort = 'bottom', toPort = 'top' } = toolArgs;
        
        // Get current workflow
        const { data: workflow, error: workflowError } = await supabase
          .from('workflows')
          .select('nodes, edges')
          .eq('id', workflowId)
          .single();
        
        if (workflowError) throw workflowError;
        
        // Validate nodes exist
        const fromNode = workflow.nodes?.find((n: any) => n.id === fromNodeId);
        const toNode = workflow.nodes?.find((n: any) => n.id === toNodeId);
        
        if (!fromNode || !toNode) {
          throw new Error('One or both nodes not found in workflow');
        }
        
        // Create new edge
        const edgeId = `${fromNodeId}-${toNodeId}-${Date.now()}`;
        const newEdge = {
          id: edgeId,
          from: { node: fromNodeId, port: fromPort },
          to: { node: toNodeId, port: toPort }
        };
        
        // Update workflow with new edge
        const updatedEdges = [...(workflow.edges || []), newEdge];
        
        const { error: updateError } = await supabase
          .from('workflows')
          .update({ 
            edges: updatedEdges,
            updated_at: new Date().toISOString()
          })
          .eq('id', workflowId);
        
        if (updateError) throw updateError;
        
        result = {
          success: true,
          edgeId,
          edge: newEdge,
          message: `Connected ${fromNode.label} → ${toNode.label}`
        };
        break;
      }

      case 'submit_workflow_plan': {
        const { plan, summary, nodeCount, edgeCount } = toolArgs;
        
        console.log('Workflow plan submitted:', { summary, nodeCount, edgeCount });
        
        // This tool doesn't modify the database - it just signals plan readiness
        // The frontend will detect this tool call and show the approval UI
        result = {
          success: true,
          message: 'Workflow plan submitted for user approval',
          data: {
            plan,
            summary,
            nodeCount,
            edgeCount
          }
        };
        break;
      }

      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Tool execution error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
