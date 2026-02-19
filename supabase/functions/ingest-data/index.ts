import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

interface IngestRequest {
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface Node {
  id: string;
  type: string;
  data: {
    config?: any;
    [key: string]: any;
  };
}

interface Edge {
  from: { node: string; port: string };
  to: { node: string; port: string };
}

interface PromptPart {
  type: 'text' | 'prompt' | 'dependency';
  value: string;
}

// Default model pricing configuration (per 1 million tokens) - used as fallback
const DEFAULT_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'google/gemini-3-flash-preview': { input: 0.10, output: 0.40 },
  'google/gemini-3-pro-preview': { input: 1.25, output: 10.00 },
  'google/gemini-2.5-pro': { input: 1.25, output: 10.00 },
  'google/gemini-2.5-flash': { input: 0.15, output: 0.60 },
  'google/gemini-2.5-flash-lite': { input: 0.075, output: 0.30 },
  'openai/gpt-5.2': { input: 2.50, output: 10.00 },
  'openai/gpt-5': { input: 2.50, output: 10.00 },
  'openai/gpt-5-mini': { input: 0.30, output: 1.20 },
  'openai/gpt-5-nano': { input: 0.10, output: 0.40 },
  'perplexity/sonar': { input: 1.00, output: 1.00 },
  'perplexity/sonar-pro': { input: 3.00, output: 15.00 },
  'perplexity/sonar-reasoning-pro': { input: 2.00, output: 8.00 },
  'perplexity/sonar-deep-research': { input: 2.00, output: 8.00 },
};

// Load pricing overrides from database
async function loadPricingOverrides(supabase: any): Promise<Record<string, { input: number; output: number }>> {
  try {
    const { data } = await supabase
      .from('model_pricing_overrides')
      .select('model_id, input_cost_per_million, output_cost_per_million');
    
    if (!data) return {};
    
    return data.reduce((acc: Record<string, { input: number; output: number }>, row: any) => {
      if (row.input_cost_per_million !== null || row.output_cost_per_million !== null) {
        const defaultPricing = DEFAULT_MODEL_PRICING[row.model_id] || { input: 0.10, output: 0.40 };
        acc[row.model_id] = {
          input: row.input_cost_per_million ?? defaultPricing.input,
          output: row.output_cost_per_million ?? defaultPricing.output,
        };
      }
      return acc;
    }, {} as Record<string, { input: number; output: number }>);
  } catch (error) {
    console.error('[loadPricingOverrides] Error:', error);
    return {};
  }
}

// Calculate cost based on model and token usage with overrides
function calculateCost(
  model: string, 
  promptTokens: number, 
  completionTokens: number,
  overrides: Record<string, { input: number; output: number }> = {}
): number {
  const pricing = overrides[model] || DEFAULT_MODEL_PRICING[model] || { input: 0.10, output: 0.40 };
  return ((promptTokens * pricing.input) + (completionTokens * pricing.output)) / 1_000_000;
}

// Map UI model names to Lovable AI model names (standardized across all edge functions)
const mapModelName = (uiModel: string): string => {
  const modelMap: { [key: string]: string } = {
    // Legacy model mappings (deprecated -> current equivalents)
    'openai-gpt-4o': 'google/gemini-3-flash-preview',
    'gpt-4o': 'google/gemini-3-flash-preview',
    'gpt-4': 'openai/gpt-5',
    'claude-3.5': 'google/gemini-2.5-pro',
    'sonar': 'google/gemini-2.5-flash',
    'local-vllm': 'google/gemini-2.5-flash',
    // Short name mappings (without provider prefix)
    'gemini-2.5-pro': 'google/gemini-2.5-pro',
    'gemini-2.5-flash': 'google/gemini-2.5-flash',
    'gemini-2.5-flash-lite': 'google/gemini-2.5-flash-lite',
    'gemini-3-flash-preview': 'google/gemini-3-flash-preview',
    'gemini-3-pro-preview': 'google/gemini-3-pro-preview',
    'gpt-5': 'openai/gpt-5',
    'gpt-5-mini': 'openai/gpt-5-mini',
    'gpt-5-nano': 'openai/gpt-5-nano',
    'gpt-5.2': 'openai/gpt-5.2',
  };
  // Return mapped model or input as-is (allows full model IDs to pass through)
  return modelMap[uiModel] || uiModel;
};

// Generate SHA-256 hash of content for change detection
const hashContent = async (content: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Extract dependency node IDs from promptParts
const getDependencyNodeIds = (node: Node): string[] => {
  const promptParts: PromptPart[] = node.data.config?.promptParts || [];
  return promptParts
    .filter(p => p.type === 'dependency')
    .map(p => p.value);
};

// Find the source node (dataset with company_ingest) in workflow
const findSourceNode = (nodes: Node[]): Node | undefined => {
  return nodes.find(node => 
    node.type === 'dataset' && 
    node.data.config?.sourceType === 'company_ingest'
  );
};

// Build topological order of nodes based on edges
const topologicalSort = (nodes: Node[], edges: Edge[]): string[] => {
  const edgeDependencies = new Map<string, string[]>();
  
  nodes.forEach(node => {
    edgeDependencies.set(node.id, []);
  });
  
  edges.forEach(edge => {
    const sourceNode = edge.from?.node;
    const targetNode = edge.to?.node;
    if (sourceNode && targetNode) {
      const deps = edgeDependencies.get(targetNode) || [];
      deps.push(sourceNode);
      edgeDependencies.set(targetNode, deps);
    }
  });

  const visited = new Set<string>();
  const sorted: string[] = [];
  
  const visit = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    
    const deps = edgeDependencies.get(nodeId) || [];
    deps.forEach(depId => visit(depId));
    
    sorted.push(nodeId);
  };
  
  nodes.forEach(node => visit(node.id));
  
  return sorted;
};

// Get all dependencies for a node (from promptParts and edges)
const getAllDependencies = (node: Node, edges: Edge[]): string[] => {
  const promptPartDeps = getDependencyNodeIds(node);
  const edgeDeps = edges
    .filter(e => e.to?.node === node.id)
    .map(e => e.from?.node)
    .filter(Boolean) as string[];
  
  return [...new Set([...promptPartDeps, ...edgeDeps])];
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get API key from header
    const apiKey = req.headers.get('x-api-key');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing X-API-Key header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role for database operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load pricing overrides from database
    const pricingOverrides = await loadPricingOverrides(supabase);

    // Validate API key and get company
    const { data: companyId, error: companyError } = await supabase
      .rpc('get_company_by_api_key', { _api_key: apiKey });

    if (companyError || !companyId) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key or inactive company' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get company details
    const { data: company, error: companyDetailsError } = await supabase
      .from('companies')
      .select('id, name, rate_limit_rpm, assigned_workflow_id')
      .eq('id', companyId)
      .single();

    if (companyDetailsError || !company) {
      return new Response(
        JSON.stringify({ error: 'Company not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body: IngestRequest = await req.json();

    if (!body.data || typeof body.data !== 'object') {
      return new Response(
        JSON.stringify({ error: 'Invalid request body. Expected { data: object }' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check rate limiting
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: recentSubmissions } = await supabase
      .from('company_data_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .gte('submitted_at', oneMinuteAgo);

    if (recentSubmissions !== null && recentSubmissions >= company.rate_limit_rpm) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded',
          limit: company.rate_limit_rpm,
          retry_after: 60
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store the submission
    const { data: submission, error: submissionError } = await supabase
      .from('company_data_submissions')
      .insert({
        company_id: companyId,
        raw_data: body.data,
        metadata: body.metadata || {},
        source_type: 'api',
        status: 'processing',
      })
      .select()
      .single();

    if (submissionError) {
      console.error('Error creating submission:', submissionError);
      return new Response(
        JSON.stringify({ error: 'Failed to store data submission' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no workflow assigned, just store the data
    if (!company.assigned_workflow_id) {
      await supabase
        .from('company_data_submissions')
        .update({ status: 'completed' })
        .eq('id', submission.id);

      return new Response(
        JSON.stringify({
          success: true,
          submission_id: submission.id,
          status: 'completed',
          message: 'Data stored (no workflow assigned)',
          cascade: null,
        }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', company.assigned_workflow_id)
      .single();

    if (workflowError || !workflow) {
      await supabase
        .from('company_data_submissions')
        .update({ status: 'error' })
        .eq('id', submission.id);

      return new Response(
        JSON.stringify({ error: 'Assigned workflow not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const nodes: Node[] = workflow.nodes || [];
    const edges: Edge[] = workflow.edges || [];
    const variables = workflow.variables || [];
    const workflowId = workflow.id;

    // Find the source node
    const sourceNode = findSourceNode(nodes);
    if (!sourceNode) {
      await supabase
        .from('company_data_submissions')
        .update({ status: 'error' })
        .eq('id', submission.id);

      return new Response(
        JSON.stringify({ error: 'Workflow has no company_ingest dataset node' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // === REACTIVE CASCADE BEGINS ===
    const startTime = Date.now();
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const results = new Map<string, any>();
    const executionStats = {
      executed: [] as string[],
      cached: [] as string[],
    };

    // Step 1: Hash the incoming data
    const incomingDataStr = JSON.stringify(body.data);
    const incomingHash = await hashContent(incomingDataStr);

    // Step 2: Check if source node hash changed
    const { data: sourceNodeData } = await supabase
      .from('company_node_data')
      .select('content_hash')
      .match({ company_id: companyId, workflow_id: workflowId, node_id: sourceNode.id })
      .single();

    const sourceHashChanged = sourceNodeData?.content_hash !== incomingHash;

    // Step 3: Store source node data with new hash
    const { data: existingSource } = await supabase
      .from('company_node_data')
      .select('version')
      .match({ company_id: companyId, workflow_id: workflowId, node_id: sourceNode.id })
      .single();

    const sourceVersion = (existingSource?.version || 0) + 1;

    await supabase
      .from('company_node_data')
      .upsert({
        company_id: companyId,
        workflow_id: workflowId,
        node_id: sourceNode.id,
        node_type: sourceNode.type,
        node_label: sourceNode.data?.label || sourceNode.type,
        data: { output: body.data },
        content_hash: incomingHash,
        dependency_hashes: {}, // Source has no dependencies
        last_executed_at: new Date().toISOString(),
        version: sourceVersion,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'company_id,workflow_id,node_id'
      });

    results.set(sourceNode.id, incomingDataStr);
    executionStats.executed.push(sourceNode.id);

    // Step 4: If source hash unchanged, return early (no cascade needed)
    if (!sourceHashChanged && sourceNodeData) {
      await supabase
        .from('company_data_submissions')
        .update({ status: 'completed' })
        .eq('id', submission.id);

      return new Response(
        JSON.stringify({
          success: true,
          submission_id: submission.id,
          status: 'completed',
          message: 'Data unchanged - no cascade needed',
          cascade: {
            executed: [],
            cached: nodes.map(n => n.id),
            execution_time_ms: Date.now() - startTime,
          },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 5: Topological sort all nodes
    const sortedNodeIds = topologicalSort(nodes, edges);

    // Step 6: Execute cascade (skip source node, already processed)
    for (const nodeId of sortedNodeIds) {
      if (nodeId === sourceNode.id) continue; // Already processed

      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const allDeps = getAllDependencies(node, edges);

      // Check if any dependency hash has changed
      let needsExecution = false;
      let executionReason = 'cache_valid';

      // Get this node's stored dependency hashes
      const { data: nodeData } = await supabase
        .from('company_node_data')
        .select('dependency_hashes, content_hash')
        .match({ company_id: companyId, workflow_id: workflowId, node_id: nodeId })
        .single();

      if (!nodeData || !nodeData.content_hash) {
        needsExecution = true;
        executionReason = 'never_executed';
      } else {
        const storedDepHashes = nodeData.dependency_hashes || {};
        
        for (const depId of allDeps) {
          const { data: depData } = await supabase
            .from('company_node_data')
            .select('content_hash')
            .match({ company_id: companyId, workflow_id: workflowId, node_id: depId })
            .single();

          const currentHash = depData?.content_hash;
          const storedHash = storedDepHashes[depId];

          if (currentHash !== storedHash) {
            needsExecution = true;
            executionReason = `dependency_changed:${depId}`;
            break;
          }
        }
      }

      if (!needsExecution) {
        // Use cached result
        const { data: cached } = await supabase
          .from('company_node_data')
          .select('data')
          .match({ company_id: companyId, workflow_id: workflowId, node_id: nodeId })
          .single();

        results.set(nodeId, cached?.data?.output || '');
        executionStats.cached.push(nodeId);
        console.log(`Node ${nodeId}: CACHED (${executionReason})`);
        continue;
      }

      console.log(`Node ${nodeId}: EXECUTING (${executionReason})`);
      executionStats.executed.push(nodeId);

      // Execute node based on type
      let output: any = '';

      if (node.type === 'promptTemplate') {
        const config = node.data.config || {};
        const model = mapModelName(config.model || 'gpt-5-mini');
        const temperature = config.temperature || 0.7;
        const maxTokens = config.maxTokens || config.max_tokens || 8000;

        // Build prompt from promptParts with markdown separators
        const promptParts: PromptPart[] = config.promptParts || [];
        let prompt = '';
        let latestDependencyUpdate: string | null = null;
        let lastPartType: string | null = null;
        
        for (const part of promptParts) {
          // Add markdown separator when transitioning between element types
          const needsSeparator = lastPartType !== null && 
            (lastPartType !== part.type || part.type === 'dependency');
          
          if (part.type === 'text' || part.type === 'prompt') {
            if (needsSeparator) {
              prompt += '\n\n---\n\n';
            }
            prompt += part.value;
            lastPartType = 'text';
          } else if (part.type === 'dependency') {
            if (needsSeparator) {
              prompt += '\n\n---\n\n';
            }
            const depResult = results.get(part.value);
            if (depResult !== undefined) {
              prompt += typeof depResult === 'string' ? depResult : JSON.stringify(depResult, null, 2);
              lastPartType = 'dependency';
            }
            // Track latest dependency update
            const { data: depData } = await supabase
              .from('company_node_data')
              .select('updated_at')
              .match({ company_id: companyId, workflow_id: workflowId, node_id: part.value })
              .maybeSingle();
            if (depData?.updated_at) {
              if (!latestDependencyUpdate || depData.updated_at > latestDependencyUpdate) {
                latestDependencyUpdate = depData.updated_at;
              }
            }
          }
        }

        // Track AI call timing
        const aiCallStart = Date.now();

        // Call Lovable AI
        const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            max_completion_tokens: maxTokens,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`AI API error for node ${nodeId}:`, errorText);
          
          // Detect model unavailability patterns and create system alert
          const isModelError = 
            response.status === 404 || 
            response.status === 410 || 
            (response.status === 400 && errorText.toLowerCase().includes('model'));
          
          if (isModelError) {
            try {
              await supabase.rpc('upsert_model_alert', {
                _model: model,
                _error_message: errorText,
                _node_id: nodeId,
                _status_code: response.status
              });
              console.log(`[ingest-data] Created/updated system alert for model ${model}`);
            } catch (alertError) {
              console.error('[ingest-data] Failed to create system alert:', alertError);
            }
          }
          
          throw new Error(`AI API error: ${response.status} - ${errorText}`);
        }

        const aiCallDuration = Date.now() - aiCallStart;
        const data = await response.json();
        output = data.choices?.[0]?.message?.content || '';
        const finishReason = data.choices?.[0]?.finish_reason;
        
        // Detect max tokens truncation
        if (finishReason === 'length') {
          console.warn(`[ingest-data] Output truncated for node "${node.data.label || nodeId}" - hit max_tokens limit (${maxTokens})`);
          try {
            await supabase.rpc('upsert_performance_alert', {
              _workflow_id: workflowId,
              _node_id: nodeId,
              _node_label: node.data.label || nodeId,
              _alert_type: 'max_tokens_hit',
              _value: data.usage?.completion_tokens || 0,
              _threshold: maxTokens,
              _description: `Output truncated at ${data.usage?.completion_tokens || 0} tokens (limit: ${maxTokens}). Increase max_tokens to allow longer outputs.`
            });
          } catch (alertError) {
            console.error('[ingest-data] Failed to create max_tokens alert:', alertError);
          }
        }
        
        // Log AI usage with cost calculation and timing
        const usage = data.usage;
        if (usage) {
          const aiPromptTokens = usage.prompt_tokens || 0;
          const aiCompletionTokens = usage.completion_tokens || 0;
          const aiTotalTokens = usage.total_tokens || aiPromptTokens + aiCompletionTokens;
          const cost = calculateCost(model, aiPromptTokens, aiCompletionTokens, pricingOverrides);
          
          console.log(`[ingest-data] AI usage for node ${nodeId}: ${aiTotalTokens} tokens, $${cost.toFixed(6)}, ${aiCallDuration}ms`);
          
          await supabase.from('ai_usage_logs').insert({
            workflow_id: workflowId,
            company_id: companyId,
            node_id: nodeId,
            model,
            prompt_tokens: aiPromptTokens,
            completion_tokens: aiCompletionTokens,
            total_tokens: aiTotalTokens,
            estimated_cost: cost,
            execution_time_ms: aiCallDuration,
            dependency_changed_at: latestDependencyUpdate,
          });
        }
      } else if (node.type === 'promptPiece') {
        const config = node.data.config || {};
        const promptParts: PromptPart[] = config.promptParts || [];
        let text = '';
        
        for (const part of promptParts) {
          if (part.type === 'text' || part.type === 'prompt') {
            text += part.value;
          } else if (part.type === 'dependency') {
            const depResult = results.get(part.value);
            if (depResult !== undefined) {
              text += typeof depResult === 'string' ? depResult : JSON.stringify(depResult);
            }
          }
        }
        
        if (!text && config.text) {
          text = config.text;
        }
        
        output = text;
      } else if (node.type === 'dataset') {
        // Non-source datasets just return their static data
        const config = node.data.config || {};
        output = JSON.stringify(config.data || []);
      } else if (node.type === 'variable') {
        const varName = node.data.config?.name;
        const variable = variables.find((v: any) => v.name === varName);
        output = variable?.value || '';
      } else if (node.type === 'framework') {
        const config = node.data.config || {};
        output = JSON.stringify({
          name: config.name || 'Unnamed Framework',
          description: config.description || '',
          type: config.type || 'rating_scale',
          schema: config.schema ? JSON.parse(config.schema) : {}
        });
      }

      results.set(nodeId, output);

      // Store result with content hash
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
      const contentHash = await hashContent(outputStr);
      
      // Build dependency hashes map
      const dependencyHashes: { [key: string]: string } = {};
      for (const depId of allDeps) {
        const { data: depData } = await supabase
          .from('company_node_data')
          .select('content_hash')
          .match({ company_id: companyId, workflow_id: workflowId, node_id: depId })
          .single();
        if (depData?.content_hash) {
          dependencyHashes[depId] = depData.content_hash;
        }
      }

      const { data: existing } = await supabase
        .from('company_node_data')
        .select('version')
        .match({ company_id: companyId, workflow_id: workflowId, node_id: nodeId })
        .single();

      const newVersion = (existing?.version || 0) + 1;

      await supabase
        .from('company_node_data')
        .upsert({
          company_id: companyId,
          workflow_id: workflowId,
          node_id: nodeId,
          node_type: node.type,
          node_label: node.data?.label || node.type,
          data: { output },
          content_hash: contentHash,
          dependency_hashes: dependencyHashes,
          last_executed_at: new Date().toISOString(),
          version: newVersion,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'company_id,workflow_id,node_id'
        });
    }

    const executionTime = Date.now() - startTime;

    // Update submission status
    await supabase
      .from('company_data_submissions')
      .update({ status: 'completed' })
      .eq('id', submission.id);

    // Build final results object
    const finalResults: Record<string, any> = {};
    for (const [nodeId, output] of results) {
      const node = nodeMap.get(nodeId);
      finalResults[nodeId] = {
        label: node?.data?.label || node?.type || nodeId,
        type: node?.type,
        output,
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        submission_id: submission.id,
        status: 'completed',
        message: 'Data ingested and cascade completed',
        cascade: {
          executed: executionStats.executed,
          cached: executionStats.cached,
          execution_time_ms: executionTime,
        },
        results: finalResults,
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Ingest error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
