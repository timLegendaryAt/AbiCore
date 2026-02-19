import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  workflowId?: string;   // Cross-workflow dependency support
  workflowName?: string; // For display purposes
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

// Calculate cost based on token usage with overrides
const calculateCost = (
  model: string, 
  promptTokens: number, 
  completionTokens: number,
  overrides: Record<string, { input: number; output: number }> = {}
): number => {
  const pricing = overrides[model] || DEFAULT_MODEL_PRICING[model] || { input: 0.10, output: 0.40 };
  return ((promptTokens * pricing.input) + (completionTokens * pricing.output)) / 1_000_000;
};

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

// Check if a node needs execution based on dependency hashes
const shouldExecuteNode = async (
  supabase: any,
  nodeId: string,
  dependencyNodeIds: string[],
  companyId: string,
  workflowId: string
): Promise<{ needsExecution: boolean; reason: string }> => {
  // If no dependencies, this is a source node - always execute
  if (dependencyNodeIds.length === 0) {
    return { needsExecution: true, reason: 'source_node' };
  }

  // Get this node's stored dependency hashes
  const { data: nodeData } = await supabase
    .from('company_node_data')
    .select('dependency_hashes, content_hash')
    .match({ company_id: companyId, workflow_id: workflowId, node_id: nodeId })
    .single();

  // If node has never run, it needs execution
  if (!nodeData || !nodeData.dependency_hashes || !nodeData.content_hash) {
    return { needsExecution: true, reason: 'never_executed' };
  }

  const storedDepHashes = nodeData.dependency_hashes || {};

  // Get current hashes of all dependencies
  for (const depId of dependencyNodeIds) {
    const { data: depData } = await supabase
      .from('company_node_data')
      .select('content_hash')
      .match({ company_id: companyId, workflow_id: workflowId, node_id: depId })
      .single();

    const currentHash = depData?.content_hash;
    const storedHash = storedDepHashes[depId];

    // If any dependency hash differs (or is missing), we need to execute
    if (currentHash !== storedHash) {
      return { needsExecution: true, reason: `dependency_changed:${depId}` };
    }
  }

  return { needsExecution: false, reason: 'cache_valid' };
};

// Extract dependency node IDs from promptParts
const getDependencyNodeIds = (node: Node): string[] => {
  const promptParts: PromptPart[] = node.data.config?.promptParts || [];
  return promptParts
    .filter(p => p.type === 'dependency')
    .map(p => p.value);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load pricing overrides from database
    const pricingOverrides = await loadPricingOverrides(supabase);

    const { workflowId, inputData, companyId, mode = 'cascade' } = await req.json();

    // Fetch workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflow) {
      throw new Error('Workflow not found');
    }

    const nodes: Node[] = workflow.nodes;
    const edges: Edge[] = workflow.edges;
    const variables = workflow.variables || [];

    // Build dependency graph from edges
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
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

    // Topological sort
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

    // Execute nodes in order
    const results = new Map<string, any>();
    const executionStats = {
      executed: [] as string[],
      cached: [] as string[],
      skipped: [] as string[],
    };
    const startTime = Date.now();

    for (const nodeId of sorted) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      // Get dependencies from promptParts (for promptTemplate nodes)
      const promptPartDeps = getDependencyNodeIds(node);
      // Combine with edge dependencies for full picture
      const allDeps = [...new Set([...promptPartDeps, ...(edgeDependencies.get(nodeId) || [])])];

      // Check if we need to execute (only in cascade mode with companyId)
      let needsExecution = true;
      let executionReason = 'force_mode';

      if (mode === 'cascade' && companyId) {
        const check = await shouldExecuteNode(supabase, nodeId, allDeps, companyId, workflowId);
        needsExecution = check.needsExecution;
        executionReason = check.reason;
      }

      if (!needsExecution) {
        // Load cached result
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

      if (node.type === 'promptTemplate') {
        // Get config
        const config = node.data.config || {};
        const model = mapModelName(config.model || 'gpt-5-mini');
        const temperature = config.temperature || 0.7;
        const maxTokens = config.maxTokens || config.max_tokens || 8000;

        // Build prompt from promptParts with markdown separators
        const promptParts: PromptPart[] = config.promptParts || [];
        let prompt = '';
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
            // First check in-memory results (same workflow execution)
            let depResult = results.get(part.value);
            
            // If not found and cross-workflow dependency, fetch from database
            if (depResult === undefined && part.workflowId && companyId) {
              const { data: crossWorkflowData } = await supabase
                .from('company_node_data')
                .select('data')
                .match({ company_id: companyId, workflow_id: part.workflowId, node_id: part.value })
                .single();
              depResult = crossWorkflowData?.data?.output;
              console.log(`[execute-workflow] Cross-workflow dep fetch: ${part.workflowId}:${part.value} = ${depResult ? 'found' : 'not found'}`);
            }
            
            if (depResult !== undefined) {
              prompt += typeof depResult === 'string' ? depResult : JSON.stringify(depResult, null, 2);
              lastPartType = 'dependency';
            }
          }
        }

        // Add input data if available
        if (inputData && inputData[nodeId]) {
          prompt += '\n\n' + inputData[nodeId];
        }

        // Skip AI call if prompt is empty or only whitespace
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) {
          console.warn(`Skipping AI call for node ${nodeId}: empty prompt`);
          results.set(nodeId, '[No data available - prompt was empty]');
        } else {
        // Determine API endpoint and auth based on model provider
          const isPerplexityModel = model.startsWith('perplexity/');
          const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
          const apiUrl = isPerplexityModel 
            ? 'https://api.perplexity.ai/chat/completions'
            : 'https://ai.gateway.lovable.dev/v1/chat/completions';
          const apiKey = isPerplexityModel ? perplexityApiKey : lovableApiKey;
          
          if (!apiKey) {
            throw new Error(isPerplexityModel 
              ? 'PERPLEXITY_API_KEY not configured'
              : 'LOVABLE_API_KEY not configured');
          }
          
          // For Perplexity, strip the provider prefix from model name
          const apiModel = isPerplexityModel ? model.replace('perplexity/', '') : model;

          // Build request body
          const requestBody: any = {
            model: apiModel,
            messages: [
              { role: 'user', content: trimmedPrompt }
            ],
            temperature,
            max_tokens: maxTokens,
          };

          // Add Google Search grounding for Gemini models when webSearch is enabled
          // (Perplexity models have built-in web search)
          if (!isPerplexityModel && config.webSearch && model.startsWith('google/')) {
            requestBody.tools = [{ googleSearch: {} }];
          }

          // Call AI API (Perplexity or Lovable Gateway)
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
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
                console.log(`[execute-workflow] Created/updated system alert for model ${model}`);
              } catch (alertError) {
                console.error('[execute-workflow] Failed to create system alert:', alertError);
              }
            }
            
            throw new Error(`AI API error: ${response.status} - ${errorText}`);
          }

          const data = await response.json();
          const output = data.choices?.[0]?.message?.content || '';
          const finishReason = data.choices?.[0]?.finish_reason;
          results.set(nodeId, output);
          
          // Detect max tokens truncation
          if (finishReason === 'length') {
            console.warn(`[execute-workflow] Output truncated for node "${node.data.label || nodeId}" - hit max_tokens limit (${maxTokens})`);
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
              console.error('[execute-workflow] Failed to create max_tokens alert:', alertError);
            }
          }
          
          // Log token usage
          const usage = data.usage;
          if (usage) {
            const promptTokens = usage.prompt_tokens || 0;
            const completionTokens = usage.completion_tokens || 0;
            const totalTokens = usage.total_tokens || promptTokens + completionTokens;
            const estimatedCost = calculateCost(model, promptTokens, completionTokens, pricingOverrides);

            await supabase.from('ai_usage_logs').insert({
              workflow_id: workflowId,
              company_id: companyId || null,
              node_id: nodeId,
              model,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: totalTokens,
              estimated_cost: estimatedCost,
            });
          }
        }
      } else if (node.type === 'promptPiece') {
        // Build text from promptParts (same structure as promptTemplate)
        const config = node.data.config || {};
        const promptParts: PromptPart[] = config.promptParts || [];
        let text = '';
        
        for (const part of promptParts) {
          if (part.type === 'text' || part.type === 'prompt') {
            text += part.value;
          } else if (part.type === 'dependency') {
            // First check in-memory results (same workflow execution)
            let depResult = results.get(part.value);
            
            // If not found and cross-workflow dependency, fetch from database
            if (depResult === undefined && part.workflowId && companyId) {
              const { data: crossWorkflowData } = await supabase
                .from('company_node_data')
                .select('data')
                .match({ company_id: companyId, workflow_id: part.workflowId, node_id: part.value })
                .single();
              depResult = crossWorkflowData?.data?.output;
            }
            
            if (depResult !== undefined) {
              text += depResult;
            }
          }
        }
        
        // Fallback to legacy text field
        if (!text && config.text) {
          text = config.text;
        }
        
        results.set(nodeId, text);
      } else if (node.type === 'ingest' || (node.type === 'dataset' && node.data.config?.sourceType === 'company_ingest')) {
        // Handle Ingest node or legacy Company Ingest source type
        if (companyId) {
          const { data: submission, error: submissionError } = await supabase
            .from('company_data_submissions')
            .select('raw_data')
            .eq('company_id', companyId)
            .order('submitted_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          if (submissionError && submissionError.code !== 'PGRST116') {
            console.warn(`Error fetching company submission for node ${nodeId}:`, submissionError);
          }
          
          results.set(nodeId, JSON.stringify(submission?.raw_data || {}));
        }
      } else if (node.type === 'dataset') {
        const config = node.data.config || {};
        
        // Handle SSOT Schema Snapshot
        if (config.sourceType === 'ssot_schema') {
          // Fetch all domain definitions
          const { data: domains } = await supabase
            .from('company_domain_definitions')
            .select('domain, display_name, description, icon_name, color, sort_order')
            .order('sort_order');
          
          // Fetch complete field definitions with hierarchy metadata
          const { data: fields } = await supabase
            .from('company_field_definitions')
            .select(`
              id,
              domain, 
              field_key, 
              display_name, 
              description, 
              field_type, 
              is_required, 
              sort_order,
              level,
              parent_field_id,
              is_scored,
              evaluation_method,
              evaluation_config,
              score_weight
            `)
            .order('domain, level, sort_order');
          
          // Fetch L1C context fact definitions
          const { data: contextDefs } = await supabase
            .from('context_fact_definitions')
            .select('fact_key, display_name, description, fact_type, category, default_domains, sort_order')
            .order('sort_order');
          
          // Build hierarchical structure for SSOT Mapping
          const schemaSnapshot = {
            company_id: companyId,  // Include company context
            domains: (domains || []).map((d: any) => {
              const domainFields = (fields || []).filter((f: any) => f.domain === d.domain);
              return {
                ...d,
                fields: domainFields,
                // Group by level for hierarchical display
                fields_by_level: {
                  L1C: domainFields.filter((f: any) => f.level === 'L1C'),
                  L2: domainFields.filter((f: any) => f.level === 'L2'),
                  L3: domainFields.filter((f: any) => f.level === 'L3'),
                  L4: domainFields.filter((f: any) => f.level === 'L4'),
                },
                field_count: domainFields.length,
                // L1C: Context facts applicable to this domain
                context_facts: (contextDefs || []).filter(
                  (cf: any) => cf.default_domains?.includes(d.domain)
                )
              };
            }),
            // Full list of context fact definitions
            context_fact_definitions: contextDefs || [],
            total_domains: domains?.length || 0,
            total_fields: fields?.length || 0,
            total_context_facts: contextDefs?.length || 0,
            generated_at: new Date().toISOString()
          };
          
          results.set(nodeId, JSON.stringify(schemaSnapshot, null, 2));
          console.log(`[execute-workflow] SSOT Schema snapshot: ${schemaSnapshot.total_domains} domains, ${schemaSnapshot.total_fields} fields, ${schemaSnapshot.total_context_facts} context facts (with hierarchy)`);
        } else if (config.sourceType === 'dataset' && config.datasetId && companyId) {
          // Fetch the dataset definition to get its dependencies
          const { data: dataset } = await supabase
            .from('datasets')
            .select('dependencies')
            .eq('id', config.datasetId)
            .maybeSingle();
          
          const dependencies = (dataset?.dependencies || []) as Array<{
            workflowId: string;
            nodeId: string;
            nodeName: string;
          }>;
          const aggregatedData: Record<string, any> = {};
          
          // For each dependency, load its output from company_node_data
          for (const dep of dependencies) {
            const { data: depNodeData } = await supabase
              .from('company_node_data')
              .select('data, node_label')
              .match({ 
                company_id: companyId, 
                workflow_id: dep.workflowId, 
                node_id: dep.nodeId 
              })
              .maybeSingle();
            
            if (depNodeData?.data?.output) {
              // Use nodeName as key (converted to snake_case for consistency)
              const key = dep.nodeName.toLowerCase().replace(/\s+/g, '_');
              aggregatedData[key] = depNodeData.data.output;
            }
          }
          
          results.set(nodeId, JSON.stringify(aggregatedData));
          console.log(`[execute-workflow] Dataset node ${nodeId}: aggregated ${Object.keys(aggregatedData).length} dependencies`);
        } else {
          const datasetData = config.data || [];
          results.set(nodeId, JSON.stringify(datasetData));
        }
      } else if (node.type === 'variable') {
        const varName = node.data.config?.name;
        const variable = variables.find((v: any) => v.name === varName);
        const value = variable?.value || '';
        results.set(nodeId, value);
      } else if (node.type === 'framework') {
        const config = node.data.config || {};
        const frameworkData = {
          name: config.name || 'Unnamed Framework',
          description: config.description || '',
          type: config.type || 'rating_scale',
          schema: config.schema ? JSON.parse(config.schema) : {}
        };
        results.set(nodeId, JSON.stringify(frameworkData));
      } else if (node.type === 'integration') {
        // Handle integration nodes (e.g., Firecrawl)
        const config = node.data.config || {};
        const integrationId = config.integrationId;
        
        if (integrationId === 'firecrawl') {
          // Build input from promptParts
          const promptParts: PromptPart[] = config.promptParts || [];
          let input = '';
          
          for (const part of promptParts) {
            if (part.type === 'text' || part.type === 'prompt') {
              input += part.value;
            } else if (part.type === 'dependency') {
              let depResult = results.get(part.value);
              if (depResult === undefined && part.workflowId && companyId) {
                const { data: crossWorkflowData } = await supabase
                  .from('company_node_data')
                  .select('data')
                  .match({ company_id: companyId, workflow_id: part.workflowId, node_id: part.value })
                  .single();
                depResult = crossWorkflowData?.data?.output;
              }
              if (depResult !== undefined) {
                input += depResult;
              }
            }
          }
          
          // Call firecrawl-execute edge function
          const firecrawlUrl = `${supabaseUrl}/functions/v1/firecrawl-execute`;
          const firecrawlResponse = await fetch(firecrawlUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              capability: config.capability,
              input: input.trim(),
              options: config.options || {},
              companyId,
              workflowId,
              nodeId,
            }),
          });
          
          const firecrawlData = await firecrawlResponse.json();
          
          if (!firecrawlResponse.ok || !firecrawlData.success) {
            console.error(`Firecrawl error for node ${nodeId}:`, firecrawlData.error);
            results.set(nodeId, `[Firecrawl error: ${firecrawlData.error || 'Unknown error'}]`);
          } else {
            results.set(nodeId, firecrawlData.output || '');
            console.log(`[execute-workflow] Firecrawl ${config.capability} completed for node ${nodeId}`);
          }
        } else {
          // Unknown integration
          results.set(nodeId, `[Unknown integration: ${integrationId}]`);
        }
      }

      // Store result with content hash if companyId provided
      if (companyId) {
        const output = results.get(nodeId);
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

        const { error: updateError } = await supabase
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

        if (updateError) {
          console.error(`Error storing node ${nodeId} data:`, updateError);
        }
      }
    }

    const executionTime = Date.now() - startTime;

    // Store execution result
    const executionRecord = {
      workflow_id: workflowId,
      company_id: companyId || null,
      input_data: inputData || {},
      results: Object.fromEntries(results),
      status: 'completed',
      execution_time_ms: executionTime,
    };

    const { data: execution, error: executionError } = await supabase
      .from('workflow_executions')
      .insert(executionRecord)
      .select()
      .single();

    if (executionError) {
      console.error('Error storing execution:', executionError);
    }

    return new Response(JSON.stringify({
      executionId: execution?.id,
      results: Object.fromEntries(results),
      executionTime,
      stats: executionStats,
      mode,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in execute-workflow:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
