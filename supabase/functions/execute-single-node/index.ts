import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// Version for deployment verification
const FUNCTION_VERSION = "1.0.0-2025-01-30";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Node {
  id: string;
  type: string;
  label?: string;
  config?: Record<string, any>;
  data?: Record<string, any>;
}

interface Edge {
  from: { node: string; port: string };
  to: { node: string; port: string };
}

interface PromptPart {
  type: 'text' | 'prompt' | 'dependency' | 'framework';
  value: string;
  workflowId?: string;
  workflowName?: string;
  frameworkName?: string;
  triggersExecution?: boolean;
}

// Default model pricing (per 1 million tokens)
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
  // Perplexity models
  'perplexity/sonar': { input: 1.00, output: 1.00 },
  'perplexity/sonar-pro': { input: 3.00, output: 15.00 },
  'perplexity/sonar-reasoning-pro': { input: 2.00, output: 8.00 },
  'perplexity/sonar-deep-research': { input: 2.00, output: 8.00 },
};

// Strip markdown code fences from AI output strings
function stripCodeFences(text: string): string {
  if (typeof text !== 'string') return text;
  let s = text.trim();
  const fullMatch = s.match(/^```(?:\w+)?\s*([\s\S]*?)```$/);
  if (fullMatch) return fullMatch[1].trim();
  s = s.replace(/^```(?:\w+)?\s*/, '');
  s = s.replace(/\s*```\s*$/, '');
  return s.trim();
}

// Map UI model names to Lovable AI model names
const mapModelName = (uiModel: string): string => {
  const modelMap: Record<string, string> = {
    'openai-gpt-4o': 'google/gemini-3-flash-preview',
    'gpt-4o': 'google/gemini-3-flash-preview',
    'claude-3.5': 'google/gemini-2.5-pro',
    'sonar': 'google/gemini-2.5-flash',
    'local-vllm': 'google/gemini-2.5-flash',
    'gemini-2.5-pro': 'google/gemini-2.5-pro',
    'gemini-2.5-flash': 'google/gemini-2.5-flash',
    'gemini-3-flash-preview': 'google/gemini-3-flash-preview',
    'gemini-3-pro-preview': 'google/gemini-3-pro-preview',
    'gpt-5': 'openai/gpt-5',
    'gpt-5-mini': 'openai/gpt-5-mini',
    'gpt-5-nano': 'openai/gpt-5-nano',
    'gpt-5.2': 'openai/gpt-5.2',
  };
  return modelMap[uiModel] || uiModel;
};

// Generate SHA-256 hash of content
const hashContent = async (content: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Calculate cost
function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = DEFAULT_MODEL_PRICING[model] || { input: 0.10, output: 0.40 };
  return ((promptTokens * pricing.input) + (completionTokens * pricing.output)) / 1_000_000;
}

// Get all dependencies for a node (promptParts + ssotMapDependencies only, NOT visual edges)
const getAllDependencies = (node: Node, edges: Edge[]): Array<{nodeId: string, workflowId?: string}> => {
  const promptParts: PromptPart[] = node.config?.promptParts || [];
  const promptPartDeps = promptParts
    .filter(p => p.type === 'dependency')
    .map(p => ({ nodeId: p.value, workflowId: p.workflowId }));
  
  // SSOT Map dependencies for variable nodes
  const ssotMapDeps: Array<{nodeId: string, workflowId?: string}> = [];
  if (node.type === 'variable' && node.config?.ssotMapMode && node.config?.ssotMapDependencies) {
    for (const dep of node.config.ssotMapDependencies) {
      if (dep.nodeId && !ssotMapDeps.some((d: any) => d.nodeId === dep.nodeId && d.workflowId === dep.workflowId)) {
        ssotMapDeps.push({ nodeId: dep.nodeId, workflowId: dep.workflowId });
      }
    }
  }
  
  // Combine and deduplicate (visual edges are cosmetic and excluded)
  const allDeps: Array<{nodeId: string, workflowId?: string}> = [...promptPartDeps];
  for (const dep of ssotMapDeps) {
    if (!allDeps.some(d => d.nodeId === dep.nodeId && d.workflowId === dep.workflowId)) {
      allDeps.push(dep);
    }
  }
  return allDeps;
};

// Find downstream nodes (for cascade continuation)
// NOTE: Visual edges (wires) are NOT used for downstream discovery
// The Prompt Builder's dependency configuration is the single source of truth
function getDownstreamNodes(
  nodeId: string, 
  nodes: Node[], 
  edges: Edge[]
): string[] {
  const downstream = new Set<string>();
  
  // Agent nodes referencing this node as sourceNodeId
  for (const node of nodes) {
    if (node.type === 'agent' && node.config?.sourceNodeId === nodeId) {
      downstream.add(node.id);
    }
  }
  
  // Any node type with promptParts dependency on this node
  for (const node of nodes) {
    if (node.config?.promptParts) {
      const hasDep = node.config.promptParts.some(
        (p: any) => p.type === 'dependency' && 
                    p.value === nodeId &&
                    p.triggersExecution !== false
      );
      if (hasDep) downstream.add(node.id);
    }
  }
  
  // Variable nodes with ssotMapDependencies referencing this node
  for (const node of nodes) {
    if (node.type === 'variable' && node.config?.ssotMapMode && node.config?.ssotMapDependencies) {
      const hasDep = node.config.ssotMapDependencies.some(
        (dep: any) => dep.nodeId === nodeId
      );
      if (hasDep) downstream.add(node.id);
    }
  }
  
  return Array.from(downstream);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint
  const url = new URL(req.url);
  if (url.searchParams.get('health') === 'true') {
    return new Response(JSON.stringify({
      status: 'healthy',
      version: FUNCTION_VERSION,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const startTime = Date.now();
  
  try {
    const { company_id, workflow_id, node_id, force = true } = await req.json();

    // Validate required fields
    if (!company_id || !workflow_id || !node_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: company_id, workflow_id, node_id'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[execute-single-node] v${FUNCTION_VERSION} - Starting execution for node ${node_id}`);

    // 1. Load workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, name, nodes, edges')
      .eq('id', workflow_id)
      .single();

    if (workflowError || !workflow) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Workflow not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const nodes: Node[] = workflow.nodes || [];
    const edges: Edge[] = workflow.edges || [];
    const node = nodes.find(n => n.id === node_id);

    if (!node) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Node not found in workflow'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Check if node is paused
    if (node.config?.paused === true) {
      console.log(`[execute-single-node] Node ${node_id} is paused, skipping`);
      return new Response(JSON.stringify({
        success: true,
        skipped: true,
        reason: 'paused',
        output: null,
        next_nodes: [],
        execution_time_ms: Date.now() - startTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Gather dependency outputs
    const dependencies = getAllDependencies(node, edges);
    const dependencyOutputs: Record<string, any> = {};
    const dependencyHashes: Record<string, string> = {};

    for (const dep of dependencies) {
      const targetWorkflowId = dep.workflowId || workflow_id;
      const { data: depData } = await supabase
        .from('company_node_data')
        .select('data, content_hash')
        .match({ company_id, workflow_id: targetWorkflowId, node_id: dep.nodeId })
        .single();
      
      if (depData?.data?.output !== undefined) {
        const depKey = dep.workflowId ? `${dep.workflowId}:${dep.nodeId}` : dep.nodeId;
        dependencyOutputs[dep.nodeId] = depData.data.output;
        dependencyHashes[depKey] = depData.content_hash || '';
      }
    }

    // 4. Execute node based on type
    let output: any = '';
    let error: string | undefined;

    try {
      if (node.type === 'promptTemplate') {
        output = await executePromptTemplate(node, dependencyOutputs, supabase, lovableApiKey, workflow_id, company_id);
      } else if (node.type === 'promptPiece') {
        output = await executePromptPiece(node, dependencyOutputs);
      } else if (node.type === 'ingest' || (node.type === 'dataset' && node.config?.sourceType === 'company_ingest')) {
        output = await executeIngest(node, company_id, supabase);
      } else if (node.type === 'dataset') {
        output = await executeDataset(node, company_id, supabase);
      } else if (node.type === 'agent') {
        output = await executeAgent(node, dependencyOutputs, supabase, workflow_id, company_id);
      } else if (node.type === 'variable' && node.config?.ssotMapMode) {
        // SSOT Map mode for Transformation nodes
        output = await executeSSOTMap(node, dependencyOutputs, supabase, company_id, workflow_id);
      } else if (node.type === 'integration') {
        // Integration nodes (Firecrawl, etc.)
        output = await executeIntegration(node, dependencyOutputs, company_id, workflow_id);
      } else {
        // For unknown types, just pass through existing data
        const { data: existing } = await supabase
          .from('company_node_data')
          .select('data')
          .match({ company_id, workflow_id, node_id })
          .single();
        output = existing?.data?.output || '';
      }
    } catch (execError) {
      console.error(`[execute-single-node] Execution error for node ${node_id}:`, execError);
      error = execError instanceof Error ? execError.message : 'Execution failed';
      output = `[Error: ${error}]`;
    }

    // 5. Store result
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
    const outputHash = await hashContent(outputStr);

    const { data: existing } = await supabase
      .from('company_node_data')
      .select('version')
      .match({ company_id, workflow_id, node_id })
      .single();

    const newVersion = (existing?.version || 0) + 1;

    await supabase
      .from('company_node_data')
      .upsert({
        company_id,
        workflow_id,
        node_id,
        node_type: node.type,
        node_label: node.label || node.data?.label || node.type,
        data: { output },
        content_hash: outputHash,
        dependency_hashes: dependencyHashes,
        last_executed_at: new Date().toISOString(),
        version: newVersion,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'company_id,workflow_id,node_id'
      });

    // 5b. Process shared cache outputs
    if (node.config?.sharedCacheOutputs && Array.isArray(node.config.sharedCacheOutputs)) {
      for (const cacheConfig of node.config.sharedCacheOutputs) {
        if (!cacheConfig.enabled) continue;
        
        const cacheId = cacheConfig.shared_cache_id;
        if (!cacheId) continue;
        
        console.log(`[execute-single-node] Writing to shared cache: ${cacheConfig.shared_cache_name || cacheId}`);
        
        try {
          const { error: cacheError } = await supabase
            .from('shared_cache_data')
            .upsert({
              shared_cache_id: cacheId,
              company_id,
              workflow_id,
              node_id,
              node_label: node.label || node.data?.label || node.type,
              data: { output },
              content_hash: outputHash,
              version: newVersion,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'shared_cache_id,company_id,workflow_id,node_id'
            });
            
          if (cacheError) {
            console.error(`[execute-single-node] Failed to write to shared cache ${cacheId}:`, cacheError);
          } else {
            console.log(`[execute-single-node] Successfully wrote to shared cache: ${cacheConfig.shared_cache_name}`);
          }
        } catch (cacheErr) {
          console.error(`[execute-single-node] Error writing to shared cache:`, cacheErr);
        }
      }
    }

    // 6. Get downstream nodes for cascade
    const nextNodes = getDownstreamNodes(node_id, nodes, edges);

    const executionTime = Date.now() - startTime;
    console.log(`[execute-single-node] Completed node ${node_id} in ${executionTime}ms, ${nextNodes.length} downstream nodes`);

    return new Response(JSON.stringify({
      success: !error,
      node_id,
      node_label: node.label || node_id,
      node_type: node.type,
      output: error ? undefined : output,
      error,
      next_nodes: nextNodes,
      execution_time_ms: executionTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[execute-single-node] Unexpected error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error',
      execution_time_ms: Date.now() - startTime
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// ============= Node Type Executors =============

async function executePromptTemplate(
  node: Node,
  dependencyOutputs: Record<string, any>,
  supabase: any,
  lovableApiKey: string | undefined,
  workflowId: string,
  companyId: string
): Promise<string> {
  const config = node.config || {};
  const model = mapModelName(config.model || 'google/gemini-3-flash-preview');
  const maxTokens = config.maxTokens || config.max_tokens || 8000;
  const promptParts: PromptPart[] = config.promptParts || [];

  // Build prompt from parts
  let prompt = '';
  for (const part of promptParts) {
    if (part.type === 'text' || part.type === 'prompt') {
      prompt += part.value;
    } else if (part.type === 'dependency') {
      const depOutput = dependencyOutputs[part.value];
      if (depOutput !== undefined) {
        const rawDepStr = typeof depOutput === 'string' ? depOutput : JSON.stringify(depOutput, null, 2);
        const depStr = typeof rawDepStr === 'string' ? stripCodeFences(rawDepStr) : rawDepStr;
        prompt += '\n\n---\n\n' + depStr;
      }
    } else if (part.type === 'framework') {
      const { data: framework } = await supabase
        .from('frameworks')
        .select('name, schema')
        .eq('id', part.value)
        .maybeSingle();
      
      if (framework?.schema) {
        const schemaContent = typeof framework.schema === 'string' 
          ? framework.schema 
          : JSON.stringify(framework.schema, null, 2);
        prompt += `\n\n--- ${framework.name} ---\n${schemaContent}\n`;
      }
    }
  }

  if (!prompt.trim()) {
    return '[No data available - prompt was empty]';
  }

  // Determine API endpoint based on model provider
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

  console.log(`[execute-single-node] Calling ${isPerplexityModel ? 'Perplexity' : 'Lovable'} AI for "${node.label}" with model ${apiModel}, prompt length: ${prompt.length}`);

  const aiCallStart = Date.now();
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: apiModel,
      messages: [{ role: 'user', content: prompt.trim() }],
      max_completion_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[execute-single-node] AI error: ${response.status} - ${errorText}`);
    
    // Detect 5xx gateway errors and create alert
    const isGatewayError = response.status >= 500 && response.status < 600;
    // Detect model-specific errors (404, 410, 400 with model message)
    const isModelError = 
      response.status === 404 || 
      response.status === 410 || 
      (response.status === 400 && errorText.toLowerCase().includes('model'));
    
    if (isGatewayError) {
      try {
        await supabase.rpc('upsert_gateway_alert', {
          _model: model,
          _error_message: errorText,
          _node_id: node.id,
          _node_label: node.label || node.id,
          _workflow_id: workflowId,
          _status_code: response.status
        });
        console.log(`[execute-single-node] Created gateway alert for ${response.status} on model ${model}`);
      } catch (alertError) {
        console.error('[execute-single-node] Failed to create gateway alert:', alertError);
      }
    } else if (isModelError) {
      try {
        await supabase.rpc('upsert_model_alert', {
          _model: model,
          _error_message: errorText,
          _node_id: node.id,
          _status_code: response.status
        });
        console.log(`[execute-single-node] Created model alert for ${model}`);
      } catch (alertError) {
        console.error('[execute-single-node] Failed to create model alert:', alertError);
      }
    }
    
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  const output = stripCodeFences(data.choices?.[0]?.message?.content || '');
  const aiCallDuration = Date.now() - aiCallStart;

  // Log usage
  const usage = data.usage;
  if (usage) {
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const cost = calculateCost(model, promptTokens, completionTokens);
    
    await supabase.from('ai_usage_logs').insert({
      workflow_id: workflowId,
      company_id: companyId,
      node_id: node.id,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: usage.total_tokens || promptTokens + completionTokens,
      estimated_cost: cost,
      execution_time_ms: aiCallDuration,
    });
    
    console.log(`[execute-single-node] AI completed in ${aiCallDuration}ms, ${usage.total_tokens} tokens, $${cost.toFixed(6)}`);
  }

  return output;
}

async function executePromptPiece(
  node: Node,
  dependencyOutputs: Record<string, any>
): Promise<string> {
  const config = node.config || {};
  const promptParts: PromptPart[] = config.promptParts || [];
  let text = '';

  for (const part of promptParts) {
    if (part.type === 'text' || part.type === 'prompt') {
      text += part.value;
    } else if (part.type === 'dependency') {
      const depOutput = dependencyOutputs[part.value];
      if (depOutput !== undefined) {
        text += typeof depOutput === 'string' ? depOutput : JSON.stringify(depOutput);
      }
    }
  }

  return text || config.text || '';
}

async function executeIngest(
  node: Node,
  companyId: string,
  supabase: any
): Promise<any> {
  const config = node.config || {};
  const integrationId = config.integrationId; // 'abivc' or 'abi'
  const ingestPointId = config.ingestPointId; // 'initial_submission', etc.
  
  // Map integration to source_type
  const sourceTypeMap: Record<string, string> = {
    'abivc': 'abivc_sync',
    'abi': 'abi_sync',
  };
  const targetSourceType = integrationId ? sourceTypeMap[integrationId] : null;

  console.log(`[executeIngest] Looking for data: integration=${integrationId}, ingestPoint=${ingestPointId}, company=${companyId}`);

  // Query 1: Try to find matching submission with intake_fields
  let query = supabase
    .from('company_data_submissions')
    .select('id, raw_data, source_type, metadata')
    .eq('company_id', companyId)
    .not('raw_data->intake_fields', 'is', null);
  
  // Filter by source type if integration is configured
  if (targetSourceType) {
    query = query.eq('source_type', targetSourceType);
  }
  
  const { data: submissions } = await query
    .order('submitted_at', { ascending: false })
    .limit(5);

  // If ingestPointId specified, filter by metadata.ingest_point
  let matchingSubmission = submissions?.[0];
  if (ingestPointId && submissions?.length > 0) {
    matchingSubmission = submissions.find((s: any) => 
      s.metadata?.ingest_point === ingestPointId
    ) || submissions[0]; // Fallback to first if no match
  }

  if (matchingSubmission) {
    console.log(`[executeIngest] Found submission with intake_fields: ${matchingSubmission.id}`);
    return matchingSubmission.raw_data;
  }

  // Query 2: Fallback to sync sources without intake_fields requirement
  const syncSources = targetSourceType ? [targetSourceType] : ['abivc_sync', 'abi_sync', 'api'];
  const { data: syncSubmissions } = await supabase
    .from('company_data_submissions')
    .select('id, raw_data, source_type, metadata')
    .eq('company_id', companyId)
    .in('source_type', syncSources)
    .order('submitted_at', { ascending: false })
    .limit(10);

  // Filter out trigger records and find real submission
  const realSubmission = syncSubmissions?.find((s: any) => 
    s.raw_data && 
    !s.raw_data._trigger && 
    Object.keys(s.raw_data).length > 1
  );

  if (realSubmission) {
    console.log(`[executeIngest] Found real submission from sync source: ${realSubmission.id}`);
    return realSubmission.raw_data;
  }

  // Query 3: Last resort - any non-trigger submission
  const { data: allSubmissions } = await supabase
    .from('company_data_submissions')
    .select('id, raw_data, source_type')
    .eq('company_id', companyId)
    .order('submitted_at', { ascending: false })
    .limit(20);

  const fallbackSubmission = allSubmissions?.find((s: any) => 
    s.raw_data && 
    !s.raw_data._trigger && 
    (s.raw_data.intake_fields || Object.keys(s.raw_data).length > 2)
  );

  if (fallbackSubmission) {
    console.log(`[executeIngest] Using fallback submission: ${fallbackSubmission.id}`);
    return fallbackSubmission.raw_data;
  }

  // No data found - return structured error instead of empty object
  console.warn(`[executeIngest] No submission data found for company ${companyId}`);
  return {
    _error: 'NO_SUBMISSION_DATA',
    _message: `No intake submission found for company. Please sync data from ${integrationId || 'the integration'} or add a manual submission.`,
    _company_id: companyId,
  };
}

async function executeDataset(
  node: Node,
  companyId: string,
  supabase: any
): Promise<any> {
  const config = node.config || {};
  
  if (config.sourceType === 'ssot_schema') {
    const { data: domains } = await supabase
      .from('company_domain_definitions')
      .select('domain, display_name, description, sort_order')
      .order('sort_order');
    
    const { data: fields } = await supabase
      .from('company_field_definitions')
      .select('domain, field_key, display_name, description, field_type, level, sort_order')
      .order('domain, sort_order');
    
    return {
      domains: (domains || []).map((d: any) => ({
        ...d,
        fields: (fields || []).filter((f: any) => f.domain === d.domain)
      })),
      total_domains: domains?.length || 0,
      total_fields: fields?.length || 0,
    };
  }
  
  if (config.sourceType === 'master_data') {
    const { data: masterData } = await supabase
      .from('company_master_data')
      .select('domain, field_key, field_value, confidence_score, updated_at')
      .eq('company_id', companyId)
      .order('domain, field_key');
    
    return masterData || [];
  }

  // Handle shared cache source type
  if (config.sourceType === 'shared_cache' && config.sharedCacheId) {
    const { data: cacheData } = await supabase
      .from('shared_cache_data')
      .select('data, node_label, updated_at')
      .match({ 
        shared_cache_id: config.sharedCacheId,
        company_id: companyId 
      })
      .order('updated_at', { ascending: false });
    
    if (cacheData && cacheData.length > 0) {
      // Aggregate all entries in the cache
      const aggregatedData: Record<string, any> = {};
      for (const entry of cacheData) {
        const key = (entry.node_label || 'data').toLowerCase().replace(/\s+/g, '_');
        aggregatedData[key] = entry.data?.output;
      }
      console.log(`[execute-single-node] Shared cache ${config.sharedCacheName || config.sharedCacheId}: loaded ${cacheData.length} entries`);
      return aggregatedData;
    } else {
      console.log(`[execute-single-node] Shared cache ${config.sharedCacheName || config.sharedCacheId}: no data found for company ${companyId}`);
      return {};
    }
  }

  return config.data || [];
}

async function executeAgent(
  node: Node,
  dependencyOutputs: Record<string, any>,
  supabase: any,
  workflowId: string,
  companyId: string
): Promise<any> {
  const config = node.config || {};
  const sourceNodeId = config.sourceNodeId;
  
  if (!sourceNodeId) {
    return { error: 'Agent node missing sourceNodeId' };
  }

  // Get source node output
  const sourceOutput = dependencyOutputs[sourceNodeId];
  if (!sourceOutput) {
    return { error: 'Source node output not found' };
  }

  // Pass through the source output for now (full agent logic can be expanded)
  return sourceOutput;
}

// Helper to extract a value from an object using a JSON path
const getValueByPath = (obj: any, path: string): any => {
  if (!obj || !path) return undefined;
  
  let current = obj;
  
  // If the value is a string, try to parse it as JSON
  if (typeof current === 'string') {
    try {
      let jsonStr = current.trim();
      
      // Handle full code block wrapping: ```json ... ```
      const fullCodeBlockMatch = jsonStr.match(/^```(?:json)?\s*([\s\S]*?)```$/);
      if (fullCodeBlockMatch) {
        jsonStr = fullCodeBlockMatch[1].trim();
      } else {
        // Handle trailing-only code fences (AI sometimes returns JSON with trailing ```)
        jsonStr = jsonStr.replace(/\s*```\s*$/g, '').trim();
        
        // Handle leading-only code fences (less common but possible)
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/g, '').trim();
      }
      
      current = JSON.parse(jsonStr);
    } catch {
      return undefined;
    }
  }
  
  const parts = path.split('.');
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
};

interface SSOTMapDependency {
  id: string;
  nodeId: string;
  nodeLabel: string;
  workflowId?: string;
  workflowName?: string;
  jsonPath: string;
  targetDomain: string;
  targetFieldKey: string;
  targetFieldName?: string;
}

// SSOT Map executor - writes mapped values directly to company_master_data
async function executeSSOTMap(
  node: Node,
  dependencyOutputs: Record<string, any>,
  supabase: any,
  companyId: string,
  workflowId: string
): Promise<any> {
  const mappings: SSOTMapDependency[] = node.config?.ssotMapDependencies || [];
  const results: any[] = [];

  console.log(`[executeSSOTMap] Processing ${mappings.length} mappings for node ${node.label || node.id}`);

  for (const mapping of mappings) {
    if (!mapping.targetDomain || !mapping.targetFieldKey) {
      console.log(`[executeSSOTMap] Skipping mapping ${mapping.id} - missing target domain or field`);
      results.push({
        field: 'incomplete',
        status: 'skipped',
        reason: 'Missing target domain or field'
      });
      continue;
    }

    const depOutput = dependencyOutputs[mapping.nodeId];
    if (depOutput === undefined) {
      console.log(`[executeSSOTMap] No output found for dependency ${mapping.nodeId}`);
      results.push({
        field: `${mapping.targetDomain}.${mapping.targetFieldKey}`,
        status: 'skipped',
        reason: 'No dependency output'
      });
      continue;
    }

    // Strip "output." prefix if present since dependencyOutputs already contains the unwrapped output
    let adjustedPath = mapping.jsonPath;
    if (adjustedPath.startsWith('output.')) {
      adjustedPath = adjustedPath.substring(7); // Remove "output." prefix
    }
    
    const extractedValue = getValueByPath(depOutput, adjustedPath);
    
    if (extractedValue === undefined) {
      console.log(`[executeSSOTMap] Could not extract value at path "${mapping.jsonPath}" (adjusted: "${adjustedPath}") from dependency ${mapping.nodeId}`);
      results.push({
        field: `${mapping.targetDomain}.${mapping.targetFieldKey}`,
        status: 'skipped',
        reason: `No value at path: ${mapping.jsonPath}`
      });
      continue;
    }

    console.log(`[executeSSOTMap] Writing ${mapping.targetDomain}.${mapping.targetFieldKey} = ${JSON.stringify(extractedValue).substring(0, 100)}`);

    // Check if record exists
    const { data: existing } = await supabase
      .from('company_master_data')
      .select('id, version')
      .match({
        company_id: companyId,
        domain: mapping.targetDomain,
        field_key: mapping.targetFieldKey
      })
      .maybeSingle();

    const sourceReference = {
      workflow_id: workflowId,
      node_id: node.id,
      node_label: node.label || node.id,
      source_node_id: mapping.nodeId,
      source_node_label: mapping.nodeLabel,
      json_path: mapping.jsonPath,
      mapped_at: new Date().toISOString()
    };

    if (existing) {
      // Update existing record
      const { error: updateError } = await supabase
        .from('company_master_data')
        .update({
          field_value: extractedValue,
          source_type: 'generated',
          source_reference: sourceReference,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error(`[executeSSOTMap] Failed to update ${mapping.targetDomain}.${mapping.targetFieldKey}:`, updateError);
        results.push({
          field: `${mapping.targetDomain}.${mapping.targetFieldKey}`,
          value: extractedValue,
          status: 'error',
          error: updateError.message
        });
      } else {
        results.push({
          field: `${mapping.targetDomain}.${mapping.targetFieldKey}`,
          value: extractedValue,
          status: 'updated'
        });
      }
    } else {
      // Insert new record
      const { error: insertError } = await supabase
        .from('company_master_data')
        .insert({
          company_id: companyId,
          domain: mapping.targetDomain,
          field_key: mapping.targetFieldKey,
          field_value: extractedValue,
          source_type: 'generated',
          source_reference: sourceReference,
          version: 1
        });

      if (insertError) {
        console.error(`[executeSSOTMap] Failed to insert ${mapping.targetDomain}.${mapping.targetFieldKey}:`, insertError);
        results.push({
          field: `${mapping.targetDomain}.${mapping.targetFieldKey}`,
          value: extractedValue,
          status: 'error',
          error: insertError.message
        });
      } else {
        results.push({
          field: `${mapping.targetDomain}.${mapping.targetFieldKey}`,
          value: extractedValue,
          status: 'created'
        });
      }
    }
  }

  const successCount = results.filter(r => r.status === 'updated' || r.status === 'created').length;
  console.log(`[executeSSOTMap] Completed: ${successCount}/${mappings.length} mappings written successfully`);

  // Trigger SSOT sync to Abi after successful writes
  if (successCount > 0) {
    const changedDomains = [...new Set(results.filter(r => r.status === 'updated' || r.status === 'created').map(r => r.field.split('.')[0]))];
    const changedFields = results
      .filter(r => r.status === 'updated' || r.status === 'created')
      .map(r => ({
        domain: r.field.split('.')[0],
        field_key: r.field.split('.')[1],
        value: r.value,
        updated_at: new Date().toISOString()
      }));
    
    // Fire and forget - don't wait for sync to complete
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    fetch(`${supabaseUrl}/functions/v1/sync-ssot-to-abi`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
      },
      body: JSON.stringify({
        company_id: companyId,
        sync_type: 'incremental',
        changed_domains: changedDomains,
        changed_fields: changedFields
      })
    }).catch(err => console.error('[executeSSOTMap] Failed to trigger SSOT sync:', err));
  }

  return {
    mappings_processed: mappings.length,
    mappings_written: successCount,
    results
  };
}

// Execute integration nodes (Firecrawl, etc.)
async function executeIntegration(
  node: Node,
  dependencyOutputs: Record<string, any>,
  companyId: string,
  workflowId: string
): Promise<string> {
  const config = node.config || {};
  const integrationId = config.integrationId;
  const capability = config.capability;
  
  if (!integrationId || !capability) {
    return '[Integration not configured - select an integration and capability]';
  }
  
  // Build input from promptParts dependencies
  let input = '';
  const promptParts = config.promptParts || [];
  
  for (const part of promptParts) {
    if (part.type === 'text' || part.type === 'prompt') {
      input += part.value;
    } else if (part.type === 'dependency') {
      const depOutput = dependencyOutputs[part.value];
      if (depOutput !== undefined) {
        input += typeof depOutput === 'string' ? depOutput : JSON.stringify(depOutput);
      }
    }
  }
  
  if (!input.trim()) {
    return '[No input provided - add a dependency that provides the URL or query]';
  }
  
  console.log(`[execute-single-node] Executing ${integrationId} ${capability} with input: ${input.substring(0, 100)}...`);
  
  // Call the firecrawl-execute edge function
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const response = await fetch(`${supabaseUrl}/functions/v1/firecrawl-execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      capability,
      input: input.trim(),
      options: config.options || {},
      companyId,
      workflowId,
      nodeId: node.id,
      nodeLabel: node.label || node.data?.label || 'Integration'
    }),
  });
  
  const result = await response.json();
  
  if (!result.success) {
    console.error(`[execute-single-node] Integration execution failed:`, result.error);
    return `[Error: ${result.error}]`;
  }
  
  console.log(`[execute-single-node] Integration ${capability} completed, output length: ${result.output?.length || 0}`);
  return result.output || '';
}
