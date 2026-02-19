import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Node {
  id: string;
  type: string;
  label?: string;
  config?: any;
  data?: {
    config?: any;
    label?: string;
    [key: string]: any;
  };
}

interface Edge {
  from: { node: string; port: string };
  to: { node: string; port: string };
}

interface PromptPart {
  type: 'text' | 'prompt' | 'dependency' | 'framework';
  value: string;
  workflowId?: string;   // Cross-workflow dependency support
  workflowName?: string; // For display purposes
  frameworkName?: string; // For framework display
  triggersExecution?: boolean; // Controls if this dependency triggers re-execution (default: true)
  systemPromptId?: string;    // Reference to system_prompts.id
  systemPromptName?: string;  // Cached name for display
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

// ============= EVALUATION SYSTEM =============
interface EvaluationResult {
  hallucination: { score: number; reasoning: string };
  dataQuality: { score: number; reasoning: string };
  complexity: { score: number; reasoning: string };
  overallScore: number;
  flags: string[];
}

// Run a single evaluation prompt with usage tracking
async function runSingleEvaluation(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
  supabase: any,
  evaluationType: string,
  workflowId: string,
  companyId: string,
  nodeId: string,
  pricingOverrides: Record<string, { input: number; output: number }> = {}
): Promise<{ score: number; reasoning: string }> {
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[evaluateGeneration] AI call failed:', response.status, errorText);
      return { score: 50, reasoning: 'Evaluation failed' };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    // Log evaluation usage with category
    const usage = data.usage;
    if (usage && supabase) {
      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      const totalTokens = usage.total_tokens || promptTokens + completionTokens;
      const cost = calculateCost('google/gemini-2.5-flash-lite', promptTokens, completionTokens, pricingOverrides);
      
      await supabase.from('ai_usage_logs').insert({
        workflow_id: workflowId,
        company_id: companyId,
        node_id: nodeId,
        model: 'google/gemini-2.5-flash-lite',
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        estimated_cost: cost,
        usage_category: `evaluation_${evaluationType}`,
      });
    }
    
    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    
    const parsed = JSON.parse(jsonStr);
    return {
      score: Math.max(0, Math.min(100, parseInt(parsed.score) || 50)),
      reasoning: parsed.reasoning || 'No reasoning provided'
    };
  } catch (error) {
    console.error('[runSingleEvaluation] Error:', error);
    return { score: 50, reasoning: 'Evaluation parsing failed' };
  }
}

// Run all three evaluations in parallel with usage tracking (respects metric toggles)
async function evaluateGeneration(
  question: string,
  reference: string,
  response: string,
  supabase: any,
  apiKey: string,
  workflowId: string,
  companyId: string,
  nodeId: string,
  pricingOverrides: Record<string, { input: number; output: number }> = {},
  metricToggles: { hallucination: boolean; dataQuality: boolean; complexity: boolean } = { hallucination: true, dataQuality: true, complexity: true }
): Promise<EvaluationResult> {
  // Check if all metrics are disabled
  if (!metricToggles.hallucination && !metricToggles.dataQuality && !metricToggles.complexity) {
    console.log('[evaluateGeneration] All metrics disabled, skipping evaluation');
    return {
      hallucination: { score: 0, reasoning: 'Metric disabled' },
      dataQuality: { score: 0, reasoning: 'Metric disabled' },
      complexity: { score: 0, reasoning: 'Metric disabled' },
      overallScore: 0,
      flags: [],
    };
  }

  // Fetch system prompts from database
  const { data: prompts, error } = await supabase
    .from('system_prompts')
    .select('name, prompt')
    .in('name', ['Hallucinations', 'Data Quality', 'Complexity']);

  if (error || !prompts || prompts.length < 3) {
    console.error('[evaluateGeneration] Failed to fetch system prompts:', error);
    return {
      hallucination: { score: 50, reasoning: 'System prompts not found' },
      dataQuality: { score: 50, reasoning: 'System prompts not found' },
      complexity: { score: 50, reasoning: 'System prompts not found' },
      overallScore: 50,
      flags: [],
    };
  }

  const promptMap = new Map<string, string>(prompts.map((p: any) => [p.name, p.prompt as string]));
  
  // Build prompts with variable substitution
  const hallPromptTemplate = promptMap.get('Hallucinations') || '';
  const hallPrompt = hallPromptTemplate
    .replace('{{question}}', question)
    .replace('{{reference}}', reference)
    .replace('{{response}}', response);
  
  const qualityPromptTemplate = promptMap.get('Data Quality') || '';
  const qualityPrompt = qualityPromptTemplate
    .replace('{{question}}', question)
    .replace('{{data}}', reference);
  
  const complexityPromptTemplate = promptMap.get('Complexity') || '';
  const complexityPrompt = complexityPromptTemplate
    .replace('{{question}}', question);

  // Run enabled evaluations in parallel with tracking
  const evaluationPromises: Promise<{ score: number; reasoning: string }>[] = [];
  const evaluationKeys: ('hallucination' | 'dataQuality' | 'complexity')[] = [];

  if (metricToggles.hallucination) {
    evaluationPromises.push(runSingleEvaluation('You are an evaluator. Output only valid JSON.', hallPrompt, apiKey, supabase, 'hallucination', workflowId, companyId, nodeId, pricingOverrides));
    evaluationKeys.push('hallucination');
  }
  if (metricToggles.dataQuality) {
    evaluationPromises.push(runSingleEvaluation('You are an evaluator. Output only valid JSON.', qualityPrompt, apiKey, supabase, 'data_quality', workflowId, companyId, nodeId, pricingOverrides));
    evaluationKeys.push('dataQuality');
  }
  if (metricToggles.complexity) {
    evaluationPromises.push(runSingleEvaluation('You are an evaluator. Output only valid JSON.', complexityPrompt, apiKey, supabase, 'complexity', workflowId, companyId, nodeId, pricingOverrides));
    evaluationKeys.push('complexity');
  }

  const results = await Promise.all(evaluationPromises);

  // Map results back to their metrics
  const hallResult = metricToggles.hallucination 
    ? results[evaluationKeys.indexOf('hallucination')] 
    : { score: 0, reasoning: 'Metric disabled' };
  const qualityResult = metricToggles.dataQuality 
    ? results[evaluationKeys.indexOf('dataQuality')] 
    : { score: 0, reasoning: 'Metric disabled' };
  const complexityResult = metricToggles.complexity 
    ? results[evaluationKeys.indexOf('complexity')] 
    : { score: 0, reasoning: 'Metric disabled' };

  // Calculate overall score (weighted average, only for enabled metrics)
  let totalWeight = 0;
  let weightedSum = 0;
  if (metricToggles.hallucination) { totalWeight += 0.5; weightedSum += hallResult.score * 0.5; }
  if (metricToggles.dataQuality) { totalWeight += 0.3; weightedSum += qualityResult.score * 0.3; }
  if (metricToggles.complexity) { totalWeight += 0.2; weightedSum += complexityResult.score * 0.2; }
  
  const overallScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

  // Generate flags based on thresholds (100% = good, so flag when LOW)
  const flags: string[] = [];
  if (metricToggles.hallucination && hallResult.score <= 40) flags.push('HIGH_HALLUCINATION');
  if (metricToggles.dataQuality && qualityResult.score <= 30) flags.push('INSUFFICIENT_DATA');
  if (metricToggles.complexity && complexityResult.score <= 20) flags.push('TOO_COMPLEX');

  return {
    hallucination: hallResult,
    dataQuality: qualityResult,
    complexity: complexityResult,
    overallScore,
    flags,
  };
}

// Get all dependencies for a node (from promptParts and edges)
const getAllDependencies = (node: Node, edges: Edge[]): string[] => {
  const config = node.config || node.data?.config || {};
  const promptParts: PromptPart[] = config.promptParts || [];
  const promptPartDeps = promptParts
    .filter(p => p.type === 'dependency')
    .map(p => p.value);
  
  const edgeDeps = edges
    .filter(e => e.to?.node === node.id)
    .map(e => e.from?.node)
    .filter(Boolean) as string[];
  
  return [...new Set([...promptPartDeps, ...edgeDeps])];
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

// Find all upstream dependencies for selected nodes
const findAllUpstreamDeps = (selectedIds: Set<string>, nodes: Node[], edges: Edge[]): Set<string> => {
  const allDeps = new Set<string>(selectedIds);
  
  const addDeps = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const deps = getAllDependencies(node, edges);
    deps.forEach(depId => {
      if (!allDeps.has(depId)) {
        allDeps.add(depId);
        addDeps(depId);
      }
    });
  };
  
  selectedIds.forEach(id => addDeps(id));
  return allDeps;
};

// Find all downstream dependents (nodes that depend on the given nodes)
const findAllDownstreamDeps = (startIds: Set<string>, nodes: Node[], edges: Edge[]): Set<string> => {
  const downstream = new Set<string>();
  let changed = true;
  
  // Keep iterating until no new nodes are found
  while (changed) {
    changed = false;
    nodes.forEach(node => {
      if (downstream.has(node.id) || startIds.has(node.id)) return;
      
      const deps = getAllDependencies(node, edges);
      // If any of this node's dependencies are in our starting set or already found downstream
      if (deps.some(d => startIds.has(d) || downstream.has(d))) {
        downstream.add(node.id);
        changed = true;
      }
    });
  }
  
  return downstream;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load pricing overrides from database
    const pricingOverrides = await loadPricingOverrides(supabase);

    // Fetch self-improvement settings from app_settings
    const { data: appSettings } = await supabase
      .from('app_settings')
      .select('self_improvement_settings')
      .limit(1)
      .maybeSingle();

    const selfImprovementSettings = appSettings?.self_improvement_settings || {
      enabled: true,
      alert_threshold: 50,
      auto_tag_low_quality: true,
      evaluation_limit: 20,
      metrics_hallucination_enabled: true,
      metrics_data_quality_enabled: true,
      metrics_complexity_enabled: true,
    };

    const alertThreshold = selfImprovementSettings.alert_threshold ?? 50;
    const autoTagLowQuality = selfImprovementSettings.auto_tag_low_quality ?? true;
    
    // Build metric toggles for evaluation function
    const metricToggles = {
      hallucination: selfImprovementSettings.metrics_hallucination_enabled !== false,
      dataQuality: selfImprovementSettings.metrics_data_quality_enabled !== false,
      complexity: selfImprovementSettings.metrics_complexity_enabled !== false,
    };

    const { workflowId, nodeIds, companyId: providedCompanyId } = await req.json();

    if (!workflowId || !nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing workflowId or nodeIds' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let companyId: string;
    let companyName: string = 'Unknown Company';

    if (providedCompanyId) {
      // Verify the provided company exists
      const { data: company, error } = await supabase
        .from('companies')
        .select('id, name')
        .eq('id', providedCompanyId)
        .single();
      
      if (error || !company) {
        return new Response(
          JSON.stringify({ error: 'Company not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      companyId = company.id;
      companyName = company.name || 'Unknown Company';
    } else {
      // Fallback: Get Test company (existing behavior for backward compatibility)
      const { data: testCompany, error: testCompanyError } = await supabase
        .from('companies')
        .select('id, name')
        .eq('name', 'Test')
        .single();

      if (testCompanyError || !testCompany) {
        return new Response(
          JSON.stringify({ error: 'Test company not found. Please create a company named "Test".' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      companyId = testCompany.id;
      companyName = testCompany.name || 'Test';
    }

    // Fetch the workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflowId)
      .single();

    if (workflowError || !workflow) {
      return new Response(
        JSON.stringify({ error: 'Workflow not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const nodes: Node[] = workflow.nodes || [];
    const edges: Edge[] = workflow.edges || [];
    const variables = workflow.variables || [];

    // Find all nodes that need to be checked:
    // 1. Selected nodes (user explicitly requested)
    // 2. Their upstream dependencies (needed for input)
    // 3. Their downstream dependents (need to cascade changes)
    const selectedSet = new Set(nodeIds);
    const upstreamDeps = findAllUpstreamDeps(selectedSet, nodes, edges);
    const downstreamDeps = findAllDownstreamDeps(selectedSet, nodes, edges);
    
    // Merge all into one set
    const nodesToExecute = new Set([...upstreamDeps, ...downstreamDeps]);
    
    // Filter nodes to only include those that need execution
    const relevantNodes = nodes.filter(n => nodesToExecute.has(n.id));
    
    // Topological sort ALL relevant nodes to get correct execution order
    const sortedNodeIds = topologicalSort(relevantNodes, edges);

    // Build paused nodes set and propagate to downstream
    const pausedNodes = new Set<string>();
    const pausedDownstream = new Set<string>();

    // Find all directly paused nodes
    for (const node of nodes) {
      const config = node.config || node.data?.config || {};
      if (config.paused === true) {
        pausedNodes.add(node.id);
      }
    }

    // Propagate pause to all downstream nodes using edge traversal
    const addDownstreamToPaused = (nodeId: string) => {
      const downstreamEdges = edges.filter(e => e.from?.node === nodeId);
      for (const edge of downstreamEdges) {
        const targetId = edge.to?.node;
        if (targetId && !pausedDownstream.has(targetId)) {
          pausedDownstream.add(targetId);
          addDownstreamToPaused(targetId);
        }
      }
    };

    for (const pausedId of pausedNodes) {
      addDownstreamToPaused(pausedId);
    }

    if (pausedNodes.size > 0) {
      console.log(`[test-nodes] Paused nodes: ${pausedNodes.size}, Downstream blocked: ${pausedDownstream.size}`);
    }

    const startTime = Date.now();
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const results = new Map<string, any>();
    const executionStats = {
      executed: [] as string[],
      cached: [] as string[],
      errors: [] as { nodeId: string; error: string }[],
    };

    // Execute nodes in topological order
    for (const nodeId of sortedNodeIds) {
      // Skip paused nodes and their downstream
      if (pausedNodes.has(nodeId) || pausedDownstream.has(nodeId)) {
        console.log(`[test-nodes] Skipping node ${nodeId}: paused or downstream of paused`);
        executionStats.cached.push(nodeId);
        continue;
      }

      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const config = node.config || node.data?.config || {};
      const allDeps = getAllDependencies(node, edges);
      
      // Check if any dependency hash has changed
      let needsExecution = false;
      let executionReason = 'cache_valid';

      // Get this node's stored dependency hashes
      const { data: nodeData } = await supabase
        .from('company_node_data')
        .select('dependency_hashes, content_hash, data')
        .match({ company_id: companyId, workflow_id: workflowId, node_id: nodeId })
        .single();

      if (!nodeData || !nodeData.content_hash) {
        needsExecution = true;
        executionReason = 'never_executed';
      } else {
        const storedDepHashes = nodeData.dependency_hashes || {};
        
        // Get promptParts to check trigger settings
        const promptParts: PromptPart[] = config.promptParts || [];
        
        for (const depId of allDeps) {
          // Check if this dependency should trigger execution
          const promptPart = promptParts.find(p => 
            p.type === 'dependency' && p.value === depId
          );
          
          // Default to triggering if not specified (backward compatible)
          const shouldTrigger = promptPart?.triggersExecution ?? true;
          
          if (!shouldTrigger) {
            console.log(`[test-nodes] Skipping trigger check for non-triggering dep: ${depId}`);
            continue;  // Skip this dependency's trigger check
          }
          
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

      // For selected nodes, always execute (user explicitly requested)
      if (selectedSet.has(nodeId)) {
        needsExecution = true;
        executionReason = 'user_requested';
      }

      // For ingest or company_ingest dataset nodes, always fetch fresh data
      const nodeConfig = node.config || node.data?.config || {};
      if (node.type === 'ingest' || (node.type === 'dataset' && nodeConfig.sourceType === 'company_ingest')) {
        needsExecution = true;
        executionReason = 'ingest_always_fresh';
      }

      if (!needsExecution && nodeData?.data?.output !== undefined) {
        results.set(nodeId, nodeData.data.output);
        executionStats.cached.push(nodeId);
        console.log(`Node ${nodeId}: CACHED`);
        continue;
      }

      console.log(`Node ${nodeId}: EXECUTING (${executionReason})`);
      executionStats.executed.push(nodeId);

      try {
        let output: any = '';
        let evaluationResult: EvaluationResult | null = null;

        if (node.type === 'promptTemplate') {
          const model = mapModelName(config.model || 'gpt-5-mini');
          const temperature = config.temperature || 0.7;
          const maxTokens = config.maxTokens || config.max_tokens || 8000;
          let systemPrompt = config.system_prompt || '';

          // Build prompt from promptParts with markdown separators
          const promptParts: PromptPart[] = config.promptParts || [];
          let prompt = '';
          let latestDependencyUpdate: string | null = null;
          let lastPartType: string | null = null;
          
          // Check for system prompt references in promptParts and fetch from database
          for (const part of promptParts) {
            if (part.systemPromptId) {
              const { data: sysPromptData, error: sysPromptError } = await supabase
                .from('system_prompts')
                .select('prompt')
                .eq('id', part.systemPromptId)
                .single();
              
              if (sysPromptError) {
                console.warn(`[test-nodes] System prompt not found: ${part.systemPromptId} (${part.systemPromptName})`);
              } else if (sysPromptData) {
                // Use system prompt as the system message
                systemPrompt = sysPromptData.prompt;
                console.log(`[test-nodes] Using system prompt: ${part.systemPromptName}`);
                break; // Use first found system prompt
              }
            }
          }
          
          for (const part of promptParts) {
            // Skip parts that are system prompts (handled above as system message)
            if (part.systemPromptId) continue;
            
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
              // Check if this is a fetchLive dependency (e.g., SSOT node)
              const depNode = nodes.find((n: Node) => n.id === part.value);
              
              if (depNode?.type === 'dataset' && depNode.config?.fetchLive === true && depNode.config?.sourceType === 'ssot_schema') {
                // Fetch live SSOT schema directly
                console.log(`[test-nodes] Fetching live SSOT data for dependency: ${part.value}`);
                
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
                
                prompt += JSON.stringify(schemaSnapshot, null, 2);
                lastPartType = 'dependency';
                console.log(`[test-nodes] Injected live SSOT: ${schemaSnapshot.total_domains} domains, ${schemaSnapshot.total_fields} fields, ${schemaSnapshot.total_context_facts} context facts (with hierarchy)`);
              } else {
                // Standard dependency resolution
                // First check in-memory results (same workflow execution)
                let depResult = results.get(part.value);
                
                // If not found and cross-workflow dependency, fetch from database
                if (depResult === undefined && part.workflowId) {
                  const { data: crossWorkflowData } = await supabase
                    .from('company_node_data')
                    .select('data, updated_at')
                    .match({ company_id: companyId, workflow_id: part.workflowId, node_id: part.value })
                    .single();
                  depResult = crossWorkflowData?.data?.output;
                  // Track latest dependency update for E2E latency
                  if (crossWorkflowData?.updated_at) {
                    if (!latestDependencyUpdate || crossWorkflowData.updated_at > latestDependencyUpdate) {
                      latestDependencyUpdate = crossWorkflowData.updated_at;
                    }
                  }
                  console.log(`[test-nodes] Cross-workflow dep fetch: ${part.workflowId}:${part.value} = ${depResult ? 'found' : 'not found'}`);
                } else {
                  // For same-workflow deps, check updated_at
                  const { data: localDepData } = await supabase
                    .from('company_node_data')
                    .select('updated_at')
                    .match({ company_id: companyId, workflow_id: workflowId, node_id: part.value })
                    .maybeSingle();
                  if (localDepData?.updated_at) {
                    if (!latestDependencyUpdate || localDepData.updated_at > latestDependencyUpdate) {
                      latestDependencyUpdate = localDepData.updated_at;
                    }
                  }
                }
                
                if (depResult !== undefined) {
                  prompt += typeof depResult === 'string' ? depResult : JSON.stringify(depResult, null, 2);
                  lastPartType = 'dependency';
                }
              }
            } else if (part.type === 'framework') {
              // Frameworks have their own formatting, no separator needed
              // Fetch framework schema from database
              const { data: framework } = await supabase
                .from('frameworks')
                .select('name, schema, type')
                .eq('id', part.value)
                .maybeSingle();
              
              if (framework && framework.schema) {
                const schemaContent = typeof framework.schema === 'string' 
                  ? framework.schema 
                  : JSON.stringify(framework.schema, null, 2);
                prompt += `\n\n--- ${framework.name} ---\n${schemaContent}\n`;
                lastPartType = 'framework';
                console.log(`[test-nodes] Added framework "${framework.name}" to prompt`);
              } else {
                console.warn(`[test-nodes] Framework not found: ${part.value}`);
                prompt += `\n[Framework not found: ${part.frameworkName || part.value}]\n`;
              }
            }
          }

          // Determine API endpoint and auth based on model provider
          const isPerplexityModel = model.startsWith('perplexity/');
          const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
          const apiUrl = isPerplexityModel 
            ? 'https://api.perplexity.ai/chat/completions'
            : 'https://ai.gateway.lovable.dev/v1/chat/completions';
          const apiKey = isPerplexityModel ? perplexityApiKey : lovableApiKey;
          
          if (!apiKey) {
            throw new Error(isPerplexityModel 
              ? 'PERPLEXITY_API_KEY not configured - please add it via Settings'
              : 'LOVABLE_API_KEY not configured');
          }
          
          // For Perplexity, strip the provider prefix from model name
          const apiModel = isPerplexityModel ? model.replace('perplexity/', '') : model;

          // Build request body
          const requestBody: any = {
            model: apiModel,
            messages: [
              ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
              { role: 'user', content: prompt }
            ],
            temperature,
            max_tokens: maxTokens,
          };

          // Add Google Search grounding for Gemini models when webSearch is enabled
          // (Perplexity models have built-in web search)
          if (!isPerplexityModel && config.webSearch && model.startsWith('google/')) {
            requestBody.tools = [{ googleSearch: {} }];
          }

          // Track AI call timing
          const aiCallStart = Date.now();

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
                console.log(`[test-nodes] Created/updated system alert for model ${model}`);
              } catch (alertError) {
                console.error('[test-nodes] Failed to create system alert:', alertError);
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
            console.warn(`[test-nodes] Output truncated for node "${node.label || nodeId}" - hit max_tokens limit (${maxTokens})`);
            try {
              await supabase.rpc('upsert_performance_alert', {
                _workflow_id: workflowId,
                _node_id: nodeId,
                _node_label: node.label || nodeId,
                _alert_type: 'max_tokens_hit',
                _value: data.usage?.completion_tokens || 0,
                _threshold: maxTokens,
                _description: `Output truncated at ${data.usage?.completion_tokens || 0} tokens (limit: ${maxTokens}). Increase max_tokens to allow longer outputs.`
              });
            } catch (alertError) {
              console.error('[test-nodes] Failed to create max_tokens alert:', alertError);
            }
          }

          // Log token usage with timing
          const usage = data.usage;
          if (usage) {
            const promptTokens = usage.prompt_tokens || 0;
            const completionTokens = usage.completion_tokens || 0;
            const totalTokens = usage.total_tokens || promptTokens + completionTokens;
            const estimatedCost = calculateCost(model, promptTokens, completionTokens, pricingOverrides);

            await supabase.from('ai_usage_logs').insert({
              workflow_id: workflowId,
              company_id: companyId,
              node_id: nodeId,
              model,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: totalTokens,
              estimated_cost: estimatedCost,
              execution_time_ms: aiCallDuration,
              dependency_changed_at: latestDependencyUpdate,
            });
          }
          
          // Run quality evaluations on successful generation
          if (output && typeof output === 'string' && output.length > 10 && !output.startsWith('[')) {
            try {
              console.log(`[test-nodes] Running quality evaluation for node "${node.label || nodeId}"...`);
              evaluationResult = await evaluateGeneration(prompt, prompt, output, supabase, lovableApiKey, workflowId, companyId, nodeId, pricingOverrides, metricToggles);
              console.log(`[test-nodes] Evaluation: overall=${evaluationResult.overallScore}, flags=${evaluationResult.flags.join(',') || 'none'}`);
            } catch (evalError) {
              console.error(`[test-nodes] Evaluation failed:`, evalError);
            }
          }
        } else if (node.type === 'promptPiece') {
          const promptParts: PromptPart[] = config.promptParts || [];
          let text = '';
          
          for (const part of promptParts) {
            if (part.type === 'text' || part.type === 'prompt') {
              text += part.value;
            } else if (part.type === 'dependency') {
              // Check if this is a fetchLive dependency (e.g., SSOT node)
              const depNode = nodes.find((n: Node) => n.id === part.value);
              
              if (depNode?.type === 'dataset' && depNode.config?.fetchLive === true && depNode.config?.sourceType === 'ssot_schema') {
                // Fetch live SSOT schema directly
                console.log(`[test-nodes] Fetching live SSOT data for promptPiece dependency: ${part.value}`);
                
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
                
                text += JSON.stringify(schemaSnapshot, null, 2);
              } else {
                // Standard dependency resolution
                let depResult = results.get(part.value);
                
                // If not found and cross-workflow dependency, fetch from database
                if (depResult === undefined && part.workflowId) {
                  const { data: crossWorkflowData } = await supabase
                    .from('company_node_data')
                    .select('data')
                    .match({ company_id: companyId, workflow_id: part.workflowId, node_id: part.value })
                    .single();
                  depResult = crossWorkflowData?.data?.output;
                }
                
                if (depResult !== undefined) {
                  text += typeof depResult === 'string' ? depResult : JSON.stringify(depResult);
                }
              }
            }
          }
          
          if (!text && config.text) {
            text = config.text;
          }
          
          output = text;
        } else if (node.type === 'ingest' || (node.type === 'dataset' && config.sourceType === 'company_ingest')) {
          // Fetch submissions to find the Initial Submission (real data, not triggers)
          const { data: submissions, error: submissionError } = await supabase
            .from('company_data_submissions')
            .select('id, raw_data, source_type')
            .eq('company_id', companyId)
            .order('submitted_at', { ascending: false })
            .limit(20);
          
          if (submissionError) {
            console.warn(`Error fetching company submissions for node ${nodeId}:`, submissionError);
          }
          
          // Find Initial Submission using same priority as frontend:
          // 1. abivc_sync/abi_sync (platform synced)
          // 2. api with real data
          // 3. manual with real data
          let initialSubmission = null;
          
          if (submissions && submissions.length > 0) {
            // Priority 1: Platform sync
            initialSubmission = submissions.find((s: any) => 
              ['abivc_sync', 'abi_sync'].includes(s.source_type) &&
              s.raw_data && !s.raw_data._trigger
            );
            
            // Priority 2: API with real data
            if (!initialSubmission) {
              initialSubmission = submissions.find((s: any) =>
                s.source_type === 'api' &&
                s.raw_data && !s.raw_data._trigger &&
                (s.raw_data.intake_fields || Object.keys(s.raw_data).length > 2)
              );
            }
            
            // Priority 3: Manual with real data
            if (!initialSubmission) {
              initialSubmission = submissions.find((s: any) =>
                s.source_type === 'manual' &&
                s.raw_data && !s.raw_data._trigger &&
                (s.raw_data.intake_fields || Object.keys(s.raw_data).length > 2)
              );
            }
          }
          
          if (initialSubmission) {
            console.log(`[test-nodes] Using Initial Submission ${initialSubmission.id} (${initialSubmission.source_type})`);
            output = JSON.stringify(initialSubmission.raw_data);
          } else {
            console.warn(`[test-nodes] No Initial Submission found for company ${companyId}`);
            output = JSON.stringify({});
          }
        } else if (node.type === 'dataset') {
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
            
            output = JSON.stringify(schemaSnapshot, null, 2);
            console.log(`[test-nodes] SSOT Schema snapshot: ${schemaSnapshot.total_domains} domains, ${schemaSnapshot.total_fields} fields (with hierarchy)`);
          } else if (config.sourceType === 'dataset' && config.datasetId) {
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
            
            output = JSON.stringify(aggregatedData);
            console.log(`[test-nodes] Dataset node ${nodeId}: aggregated ${Object.keys(aggregatedData).length} dependencies`);
          } else if (config.sourceType === 'shared_cache' && config.sharedCacheId) {
            // Fetch data from shared cache
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
              output = JSON.stringify(aggregatedData);
              console.log(`[test-nodes] Shared cache ${config.sharedCacheName || config.sharedCacheId}: loaded ${cacheData.length} entries`);
            } else {
              output = JSON.stringify({});
              console.log(`[test-nodes] Shared cache ${config.sharedCacheName || config.sharedCacheId}: no data found for company ${companyId}`);
            }
          } else {
            // Fallback to existing logic for other dataset types
            const { data: existingData } = await supabase
              .from('company_node_data')
              .select('data')
              .match({ company_id: companyId, workflow_id: workflowId, node_id: nodeId })
              .maybeSingle();
            
            output = existingData?.data?.output || config.data || [];
            if (typeof output !== 'string') {
              output = JSON.stringify(output);
            }
          }
        } else if (node.type === 'variable') {
          const varName = config.name;
          const variable = variables.find((v: any) => v.name === varName);
          output = variable?.value || config.default || '';
        } else if (node.type === 'framework') {
          // Safe schema parsing - document-type frameworks contain plain text, not JSON
          let schemaData: any = {};
          if (config.schema) {
            if (config.type === 'document') {
              // Document frameworks store plain text content
              schemaData = config.schema;
            } else {
              // Structured frameworks store JSON
              try {
                schemaData = JSON.parse(config.schema);
              } catch {
                // Fallback to raw content if JSON parse fails
                schemaData = config.schema;
              }
            }
          }
          
          output = JSON.stringify({
            name: config.name || 'Unnamed Framework',
            description: config.description || '',
            type: config.type || 'rating_scale',
            schema: schemaData
          });
        } else if (node.type === 'workflow') {
          // Nested workflow - just return info about it
          output = JSON.stringify({
            workflowId: config.workflowId,
            workflowName: config.workflowName,
          });
        } else if (node.type === 'integration') {
          // Handle integration nodes (e.g., Firecrawl)
          const integrationId = config.integrationId;
          
          if (integrationId === 'firecrawl') {
            // Build input from promptParts
            const promptParts = config.promptParts || [];
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
                  input += typeof depResult === 'string' ? depResult : JSON.stringify(depResult);
                }
              }
            }
            
            // Call firecrawl-execute edge function
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
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
              console.error(`[test-nodes] Firecrawl error for node ${nodeId}:`, firecrawlData.error);
              output = `[Firecrawl error: ${firecrawlData.error || 'Unknown error'}]`;
            } else {
              output = firecrawlData.output || '';
              console.log(`[test-nodes] Firecrawl ${config.capability} completed for node ${nodeId}`);
            }
          } else {
            output = `[Unknown integration: ${integrationId}]`;
          }
        }

        results.set(nodeId, output);

        // Calculate content hash
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
        const contentHash = await hashContent(outputStr);

        // Calculate dependency hashes
        const depHashes: Record<string, string> = {};
        for (const depId of allDeps) {
          const { data: depData } = await supabase
            .from('company_node_data')
            .select('content_hash')
            .match({ company_id: companyId, workflow_id: workflowId, node_id: depId })
            .single();
          if (depData?.content_hash) {
            depHashes[depId] = depData.content_hash;
          }
        }

        // Build data object with output and optional evaluation
        const nodeDataToStore: Record<string, any> = { output };
        if (evaluationResult && node.type === 'promptTemplate') {
          nodeDataToStore.evaluation = {
            hallucination: evaluationResult.hallucination,
            dataQuality: evaluationResult.dataQuality,
            complexity: evaluationResult.complexity,
            overallScore: evaluationResult.overallScore,
            evaluatedAt: new Date().toISOString(),
            evaluationModel: 'google/gemini-2.5-flash-lite'
          };
          nodeDataToStore.flags = evaluationResult.flags;

          const nodeLabel = node.label || node.data?.label || node.type;
          
          // Store evaluation history for last 20 generations tracking
          try {
            await supabase.from('evaluation_history').insert({
              company_id: companyId,
              workflow_id: workflowId,
              node_id: nodeId,
              node_label: nodeLabel,
              hallucination_score: evaluationResult.hallucination?.score,
              hallucination_reasoning: evaluationResult.hallucination?.reasoning,
              data_quality_score: evaluationResult.dataQuality?.score,
              data_quality_reasoning: evaluationResult.dataQuality?.reasoning,
              complexity_score: evaluationResult.complexity?.score,
              complexity_reasoning: evaluationResult.complexity?.reasoning,
              overall_score: evaluationResult.overallScore,
              flags: evaluationResult.flags || [],
              evaluated_at: new Date().toISOString()
            });
            console.log(`[test-nodes] Stored evaluation history for node ${nodeId}`);
          } catch (histErr) {
            console.error('[test-nodes] Failed to store evaluation history:', histErr);
          }

          // Trigger alerts for low scores (using dynamic threshold from settings, only if metric is enabled)
          if (metricToggles.hallucination && evaluationResult.hallucination?.score !== undefined && evaluationResult.hallucination.score < alertThreshold) {
            try {
              await supabase.rpc('upsert_quality_alert', {
                _company_id: companyId,
                _company_name: companyName,
                _node_id: nodeId,
                _node_label: nodeLabel,
                _alert_type: 'hallucination',
                _score: evaluationResult.hallucination.score,
                _reasoning: evaluationResult.hallucination.reasoning || ''
              });
              console.log(`[test-nodes] Created hallucination alert for ${nodeLabel}`);
            } catch (alertErr) {
              console.error('[test-nodes] Failed to create hallucination alert:', alertErr);
            }
          }

          if (metricToggles.dataQuality && evaluationResult.dataQuality?.score !== undefined && evaluationResult.dataQuality.score < alertThreshold) {
            try {
              await supabase.rpc('upsert_quality_alert', {
                _company_id: companyId,
                _company_name: companyName,
                _node_id: nodeId,
                _node_label: nodeLabel,
                _alert_type: 'data_quality',
                _score: evaluationResult.dataQuality.score,
                _reasoning: evaluationResult.dataQuality.reasoning || ''
              });
              console.log(`[test-nodes] Created data quality alert for ${nodeLabel}`);

              // Tag low quality fields in company_node_data (only if auto_tag_low_quality is enabled)
              if (autoTagLowQuality) {
                nodeDataToStore.low_quality_fields = nodeDataToStore.low_quality_fields || [];
                nodeDataToStore.low_quality_fields.push({
                  field: nodeLabel,
                  score: evaluationResult.dataQuality.score,
                  reasoning: evaluationResult.dataQuality.reasoning,
                  flagged_at: new Date().toISOString()
                });
              }
            } catch (alertErr) {
              console.error('[test-nodes] Failed to create data quality alert:', alertErr);
            }
          }

          if (metricToggles.complexity && evaluationResult.complexity?.score !== undefined && evaluationResult.complexity.score < alertThreshold) {
            try {
              await supabase.rpc('upsert_quality_alert', {
                _company_id: companyId,
                _company_name: companyName,
                _node_id: nodeId,
                _node_label: nodeLabel,
                _alert_type: 'complexity',
                _score: evaluationResult.complexity.score,
                _reasoning: evaluationResult.complexity.reasoning || ''
              });
              console.log(`[test-nodes] Created complexity alert for ${nodeLabel}`);
            } catch (alertErr) {
              console.error('[test-nodes] Failed to create complexity alert:', alertErr);
            }
          }
        }

        // Store result
        await supabase
          .from('company_node_data')
          .upsert({
            company_id: companyId,
            workflow_id: workflowId,
            node_id: nodeId,
            node_type: node.type,
            node_label: node.label || node.data?.label || node.type,
            data: nodeDataToStore,
            content_hash: contentHash,
            dependency_hashes: depHashes,
            last_executed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'company_id,workflow_id,node_id'
          });

        // ============= SHARED CACHE OUTPUTS =============
        // Process shared cache outputs for generative nodes
        if (config.sharedCacheOutputs && Array.isArray(config.sharedCacheOutputs)) {
          for (const cacheConfig of config.sharedCacheOutputs) {
            if (!cacheConfig.enabled) continue;
            
            const cacheId = cacheConfig.shared_cache_id;
            if (!cacheId) continue;
            
            console.log(`[test-nodes] Writing to shared cache: ${cacheConfig.shared_cache_name || cacheId}`);
            
            try {
              // Upsert to shared_cache_data
              const { error: cacheError } = await supabase
                .from('shared_cache_data')
                .upsert({
                  shared_cache_id: cacheId,
                  company_id: companyId,
                  workflow_id: workflowId,
                  node_id: nodeId,
                  node_label: node.label || node.data?.label || node.type,
                  data: { output },
                  content_hash: contentHash,
                  version: 1,
                  updated_at: new Date().toISOString()
                }, {
                  onConflict: 'shared_cache_id,company_id,workflow_id,node_id'
                });
                
              if (cacheError) {
                console.error(`[test-nodes] Failed to write to shared cache ${cacheId}:`, cacheError);
              } else {
                console.log(`[test-nodes] Successfully wrote to shared cache: ${cacheConfig.shared_cache_name}`);
              }
            } catch (cacheErr) {
              console.error(`[test-nodes] Error writing to shared cache:`, cacheErr);
            }
          }
        }

      } catch (error) {
        console.error(`Error executing node ${nodeId}:`, error);
        executionStats.errors.push({
          nodeId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        results.set(nodeId, `Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Build response with results for requested nodes
    const nodeResults: Record<string, { output: any; executedAt: string; cached: boolean }> = {};
    
    for (const nodeId of nodeIds) {
      const output = results.get(nodeId);
      const cached = executionStats.cached.includes(nodeId);
      
      // Get stored timestamp
      const { data: storedData } = await supabase
        .from('company_node_data')
        .select('last_executed_at')
        .match({ company_id: companyId, workflow_id: workflowId, node_id: nodeId })
        .single();
      
      nodeResults[nodeId] = {
        output,
        executedAt: storedData?.last_executed_at || new Date().toISOString(),
        cached
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        results: nodeResults,
        stats: {
          executed: executionStats.executed.length,
          cached: executionStats.cached.length,
          errors: executionStats.errors.length,
          executionTimeMs: Date.now() - startTime,
        },
        errors: executionStats.errors.length > 0 ? executionStats.errors : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Test nodes error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
