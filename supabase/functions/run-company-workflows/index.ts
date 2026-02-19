import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// Version for deployment verification
const FUNCTION_VERSION = "3.0.0-2025-01-29";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Node {
  id: string;
  type: string;
  label?: string;
  config?: {
    sourceType?: string;
    promptParts?: PromptPart[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    name?: string;
    description?: string;
    schema?: string;
    data?: any[];
    text?: string;
    [key: string]: any;
  };
  data?: {
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

// Strip markdown code fences from AI output strings
function stripCodeFences(text: string): string {
  if (typeof text !== 'string') return text;
  let s = text.trim();
  // Full code block wrapping: ```json ... ```
  const fullMatch = s.match(/^```(?:\w+)?\s*([\s\S]*?)```$/);
  if (fullMatch) return fullMatch[1].trim();
  // Leading-only fence
  s = s.replace(/^```(?:\w+)?\s*/, '');
  // Trailing-only fence
  s = s.replace(/\s*```\s*$/, '');
  return s.trim();
}

// Stop trigger constant - used to skip downstream nodes when no match found
const STOP_TRIGGER_CODE = 'f8Tsc';
const STOP_TRIGGER_INSTRUCTION = '\n\nIf none matched, ONLY output "f8Tsc".';

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

// Map UI model names to Lovable AI model names
const mapModelName = (uiModel: string): string => {
  const modelMap: { [key: string]: string } = {
    // Legacy model mappings (deprecated models -> current equivalents)
    'openai-gpt-4o': 'google/gemini-3-flash-preview',
    'gpt-4o': 'google/gemini-3-flash-preview',
    'gpt-4': 'openai/gpt-5',
    'claude-3.5': 'google/gemini-2.5-pro',
    'sonar': 'google/gemini-2.5-flash',
    'local-vllm': 'google/gemini-2.5-flash',
    // Short name mappings
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

// Helper function to extract value from JSON using dot-notation path
// Supports nested paths like "output.market_growth_score" and handles stringified JSON
const getValueByPath = (data: any, path: string): any => {
  if (!path || data === undefined || data === null) return undefined;
  
  // Parse stringified JSON if needed (common with AI outputs)
  let parsedData = data;
  if (typeof data === 'string') {
    try {
      // Handle markdown code blocks
      let jsonStr = data.trim();
      
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
      
      parsedData = JSON.parse(jsonStr);
    } catch {
      // If it's not valid JSON, check if path is just trying to get the string itself
      if (path === 'output' || path === '') return data;
      return undefined;
    }
  }
  
  // Handle paths like "output.field" or just "field"
  const parts = path.split('.');
  let current = parsedData;
  
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    
    // Handle array access like "items[0]"
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, indexStr] = arrayMatch;
      current = current[key];
      if (Array.isArray(current)) {
        current = current[parseInt(indexStr, 10)];
      } else {
        return undefined;
      }
    } else {
      current = current[part];
    }
    
    // Try to parse nested stringified JSON
    if (typeof current === 'string') {
      try {
        let jsonStr = current.trim();
        const jsonMatch = current.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1].trim();
        }
        if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
          current = JSON.parse(jsonStr);
        }
      } catch {
        // Keep as string if not valid JSON
      }
    }
  }
  
  return current;
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

// Extract dependency node IDs from promptParts with workflow context
const getDependencyNodeIds = (node: Node): Array<{nodeId: string, workflowId?: string}> => {
  const promptParts: PromptPart[] = node.config?.promptParts || [];
  return promptParts
    .filter(p => p.type === 'dependency')
    .map(p => ({ nodeId: p.value, workflowId: p.workflowId }));
};

// Find the source node (ingest or legacy dataset with company_ingest) in workflow
const findSourceNode = (nodes: Node[]): Node | undefined => {
  return nodes.find(node => 
    // New ingest node type
    node.type === 'ingest' ||
    // Legacy: dataset with company_ingest source
    (node.type === 'dataset' && node.config?.sourceType === 'company_ingest')
  );
};

// Build topological order of nodes using Kahn's algorithm based on promptParts,
// agent sourceNodeId, and ssotMapDependencies (NOT visual edges, which are cosmetic)
const topologicalSort = (nodes: Node[], edges: Edge[]): string[] => {
  const nodeIds = new Set(nodes.map(n => n.id));
  // Build adjacency: for each node, which nodes depend on it (downstream)
  const downstream = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();
  
  for (const id of nodeIds) {
    downstream.set(id, new Set());
    inDegree.set(id, 0);
  }
  
  // Helper to add an edge in the dependency graph
  const addDep = (fromId: string, toId: string) => {
    if (!nodeIds.has(fromId) || !nodeIds.has(toId) || fromId === toId) return;
    const ds = downstream.get(fromId)!;
    if (!ds.has(toId)) {
      ds.add(toId);
      inDegree.set(toId, (inDegree.get(toId) || 0) + 1);
    }
  };
  
  for (const node of nodes) {
    // 1. promptParts dependencies (where triggersExecution !== false)
    const promptParts: PromptPart[] = node.config?.promptParts || [];
    for (const part of promptParts) {
      if (part.type === 'dependency' && part.triggersExecution !== false) {
        // Only add same-workflow deps (cross-workflow are static cache reads)
        if (!part.workflowId) {
          addDep(part.value, node.id);
        }
      }
    }
    
    // 2. Agent sourceNodeId
    if (node.type === 'agent' && node.config?.sourceNodeId) {
      addDep(node.config.sourceNodeId, node.id);
    }
    
    // 3. ssotMapDependencies for variable nodes
    if (node.type === 'variable' && node.config?.ssotMapMode && node.config?.ssotMapDependencies) {
      for (const dep of node.config.ssotMapDependencies) {
        if (dep.nodeId && !dep.workflowId) {
          addDep(dep.nodeId, node.id);
        }
      }
    }
  }
  
  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  
  const sorted: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);
    for (const next of downstream.get(current) || []) {
      const newDeg = (inDegree.get(next) || 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }
  
  // Append any remaining nodes (cycle fallback)
  for (const id of nodeIds) {
    if (!sorted.includes(id)) sorted.push(id);
  }
  
  return sorted;
};

// Get all dependencies for a node (from promptParts and ssotMapDependencies only, NOT visual edges)
// Returns both node IDs and workflow context for cross-workflow resolution
const getAllDependencies = (node: Node, edges: Edge[]): Array<{nodeId: string, workflowId?: string}> => {
  const promptPartDeps = getDependencyNodeIds(node);
  
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

// Check if workflow has a company_ingest node (new ingest type or legacy dataset)
const hasCompanyIngestNode = (nodes: Node[]): boolean => {
  return nodes.some(node => 
    // New ingest node type
    node.type === 'ingest' ||
    // Legacy: dataset with company_ingest source
    (node.type === 'dataset' && node.config?.sourceType === 'company_ingest')
  );
};

// Find the most recent submission with actual company data
// Optionally respects node config for integration/ingest point filtering
async function findLatestDataSubmission(
  supabase: any, 
  companyId: string,
  nodeConfig?: { integrationId?: string; ingestPointId?: string }
): Promise<{ id: string; raw_data: any; _error?: string; _message?: string } | null> {
  const integrationId = nodeConfig?.integrationId;
  const ingestPointId = nodeConfig?.ingestPointId;
  
  // Map integration to source_type
  const sourceTypeMap: Record<string, string> = {
    'abivc': 'abivc_sync',
    'abi': 'abi_sync',
  };
  const targetSourceType = integrationId ? sourceTypeMap[integrationId] : null;

  console.log(`[findLatestDataSubmission] Looking for data: integration=${integrationId}, ingestPoint=${ingestPointId}, company=${companyId}`);

  // Query 1: Try to find submission with intake_fields (filtered by source if configured)
  let query = supabase
    .from('company_data_submissions')
    .select('id, raw_data, source_type, metadata')
    .eq('company_id', companyId)
    .not('raw_data->intake_fields', 'is', null);
  
  if (targetSourceType) {
    query = query.eq('source_type', targetSourceType);
  }
  
  const { data: intakeSubmissions, error: intakeError } = await query
    .order('submitted_at', { ascending: false })
    .limit(5);

  if (!intakeError && intakeSubmissions && intakeSubmissions.length > 0) {
    // If ingestPointId specified, try to match metadata.ingest_point
    let matchingSubmission = intakeSubmissions[0];
    if (ingestPointId) {
      matchingSubmission = intakeSubmissions.find((s: any) => 
        s.metadata?.ingest_point === ingestPointId
      ) || intakeSubmissions[0];
    }
    console.log('[findLatestDataSubmission] Found submission with intake_fields:', matchingSubmission.id);
    return matchingSubmission;
  }

  // Query 2: Find submissions from sync sources
  const syncSources = targetSourceType ? [targetSourceType] : ['abivc_sync', 'abi_sync', 'api'];
  const { data: syncSubmissions, error: syncError } = await supabase
    .from('company_data_submissions')
    .select('id, raw_data, source_type, metadata')
    .eq('company_id', companyId)
    .in('source_type', syncSources)
    .order('submitted_at', { ascending: false })
    .limit(10);

  if (!syncError && syncSubmissions && syncSubmissions.length > 0) {
    const realSubmission = syncSubmissions.find((s: any) => 
      s.raw_data && 
      !s.raw_data._trigger &&
      Object.keys(s.raw_data).length > 1
    );

    if (realSubmission) {
      console.log('[findLatestDataSubmission] Found real submission from sync source:', realSubmission.id, 'source:', realSubmission.source_type);
      return realSubmission;
    }
  }

  // Query 3: Fallback - search all submissions
  const { data: allSubmissions, error: allError } = await supabase
    .from('company_data_submissions')
    .select('id, raw_data, source_type')
    .eq('company_id', companyId)
    .order('submitted_at', { ascending: false })
    .limit(50);

  if (!allError && allSubmissions && allSubmissions.length > 0) {
    const realSubmission = allSubmissions.find((s: any) => 
      s.raw_data && 
      !s.raw_data._trigger &&
      (s.raw_data.intake_fields || Object.keys(s.raw_data).length > 2)
    );

    if (realSubmission) {
      console.log('[findLatestDataSubmission] Found real submission in fallback search:', realSubmission.id);
      return realSubmission;
    }
  }

  console.warn('[findLatestDataSubmission] No real data submission found for company:', companyId);
  return null;
}

// Process workflows for a single company
async function processCompanyWorkflows(
  supabase: any,
  company_id: string,
  submission_id: string,
  specificWorkflowId: string | null,
  empty_only: boolean = false,
  force: boolean = false,
  start_from_node_id: string | null = null
): Promise<any> {
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

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

  // Fetch company name for alerts
  const { data: companyRecord } = await supabase
    .from('companies')
    .select('name')
    .eq('id', company_id)
    .single();
  const companyName = companyRecord?.name || 'Unknown Company';

  // Fetch the submission
  const { data: submission, error: submissionError } = await supabase
    .from('company_data_submissions')
    .select('*')
    .eq('id', submission_id)
    .eq('company_id', company_id)
    .single();

  console.log('[run-company-workflows] Submission fetch:', { found: !!submission, error: submissionError?.message });
  
  // Check if this is a trigger-only submission (manual run) without real data
  if (submission && submission.raw_data?._trigger && !submission.raw_data?.intake_fields) {
    console.log('[run-company-workflows] Trigger submission detected, looking for actual company data...');
    
    const realSubmission = await findLatestDataSubmission(supabase, company_id);
    if (realSubmission && realSubmission.raw_data) {
      console.log('[run-company-workflows] Found real submission with data, using it instead');
      console.log('[run-company-workflows] Real submission intake_fields keys:', 
        realSubmission.raw_data.intake_fields ? Object.keys(realSubmission.raw_data.intake_fields).length : 0);
      
      // Use the real data but keep the trigger submission record
      submission.raw_data = realSubmission.raw_data;
    } else {
      console.warn('[run-company-workflows] No real data submission found for company!');
    }
  }

  if (submissionError || !submission) {
    throw new Error('Submission not found');
  }

  // Update submission to processing
  await supabase
    .from('company_data_submissions')
    .update({ status: 'processing' })
    .eq('id', submission_id);

  // Fetch workflows - either specific one or all
  let workflows: any[] = [];
  if (specificWorkflowId) {
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', specificWorkflowId)
      .single();
    
    if (!error && data) {
      workflows = [data];
    }
    console.log('[run-company-workflows] Fetched specific workflow:', { id: specificWorkflowId, found: !!data });
  } else {
    // Get ALL workflows (including child workflows)
    // We'll filter to those with company_ingest nodes
    const { data, error } = await supabase
      .from('workflows')
      .select('*');
    
    if (!error && data) {
      workflows = data;
    }
    console.log('[run-company-workflows] Fetched all workflows:', { count: workflows.length });
  }

  // Extract ingest_point from submission metadata for filtering
  const submissionIngestPoint = (submission.metadata as any)?.ingest_point || 'initial_submission';
  const submissionSource = (submission.metadata as any)?.synced_from;
  console.log(`[run-company-workflows] Submission ingest point: ${submissionIngestPoint}, source: ${submissionSource}`);

  // Filter to only workflows that have company_ingest nodes AND are company-relevant AND match ingest point
  let relevantWorkflows = workflows.filter(w => {
    const nodes: Node[] = w.nodes || [];
    const hasIngest = hasCompanyIngestNode(nodes);
    
    // Check data attribution - only process company-relevant workflows
    const settings = w.settings as { data_attribution?: string } | null;
    const attribution = settings?.data_attribution || 'company_data';
    const isCompanyRelevant = attribution === 'company_data' || attribution === 'company_related_data';
    
    // Find the ingest node to check ingest point matching
    const ingestNode = nodes.find(n => n.type === 'ingest' || (n.type === 'dataset' && n.config?.sourceType === 'company_ingest'));
    const workflowIngestPoint = ingestNode?.config?.ingestPointId || 'initial_submission';
    const workflowIntegrationId = ingestNode?.config?.integrationId;
    
    // If submission came from AbiVC, only run workflows with matching ingest points
    let ingestPointMatches = true;
    if (submissionSource === 'abivc' && workflowIntegrationId === 'abivc') {
      ingestPointMatches = workflowIngestPoint === submissionIngestPoint;
      if (!ingestPointMatches) {
        console.log(`[run-company-workflows] Skipping workflow "${w.name}": ingest point mismatch (workflow=${workflowIngestPoint}, submission=${submissionIngestPoint})`);
      }
    }
    
    console.log(`[run-company-workflows] Workflow "${w.name}" (${w.id}): nodes=${nodes.length}, hasCompanyIngest=${hasIngest}, attribution=${attribution}, isCompanyRelevant=${isCompanyRelevant}, ingestPoint=${workflowIngestPoint}, matches=${ingestPointMatches}`);
    
    // Debug: log node types and configs
    nodes.forEach(n => {
      if (n.type === 'dataset') {
        console.log(`  - Dataset node "${n.id}": sourceType=${n.config?.sourceType}`);
      }
    });
    
    return hasIngest && isCompanyRelevant && ingestPointMatches;
  });

  console.log('[run-company-workflows] Relevant workflows with company_ingest:', relevantWorkflows.length);

  // For empty_only mode, filter to workflows that have unexecuted/empty nodes
  if (empty_only) {
    console.log('[run-company-workflows] Filtering for empty workflows only');
    const filteredWorkflows = [];
    
    for (const workflow of relevantWorkflows) {
      const { data: existingNodeData } = await supabase
        .from('company_node_data')
        .select('node_id, last_executed_at, data')
        .match({ company_id, workflow_id: workflow.id });
      
      // Check if any node has never been executed or has no output
      const hasEmptyNodes = !existingNodeData || existingNodeData.length === 0 || existingNodeData.some((n: any) => 
        !n.last_executed_at || !n.data?.output
      );
      
      if (hasEmptyNodes) {
        filteredWorkflows.push(workflow);
        console.log(`[run-company-workflows] Workflow "${workflow.name}" has empty nodes, will process`);
      } else {
        console.log(`[run-company-workflows] Workflow "${workflow.name}" has all nodes executed, skipping`);
      }
    }
    
    relevantWorkflows = filteredWorkflows;
    console.log('[run-company-workflows] After empty filter:', relevantWorkflows.length);
  }

  if (relevantWorkflows.length === 0) {
    await supabase
      .from('company_data_submissions')
      .update({ status: 'completed', processed_at: new Date().toISOString() })
      .eq('id', submission_id);

    return {
      success: true,
      message: empty_only ? 'No workflows with empty nodes found' : 'No workflows with company_ingest nodes found',
      workflows_processed: 0,
      debug: {
        total_workflows_fetched: workflows.length,
        workflow_names: workflows.map((w: any) => w.name),
      }
    };
  }

  const startTime = Date.now();
  const workflowResults: any[] = [];
  
  // Track outputs for Abi sync
  const abiOutputNodes: Array<{
    node_id: string;
    node_label: string;
    node_type: string;
    workflow_id: string;
    workflow_name: string;
    data: any;
    version: number;
    updated_at: string;
  }> = [];

  // Track outputs for AbiVC sync
  const abivcOutputNodes: Array<{
    node_id: string;
    node_label: string;
    node_type: string;
    workflow_id: string;
    workflow_name: string;
    data: any;
    version: number;
    updated_at: string;
  }> = [];

  // Track outputs for Master Data sync
  const masterDataOutputNodes: Array<{
    node_id: string;
    node_label: string;
    workflow_id: string;
    domain: string;
    field_key: string;
    value: any;
  }> = [];

  // Track outputs for SSOT Update (AI-generated change plans)
  const ssotUpdateNodes: Array<{
    node_id: string;
    node_label: string;
    workflow_id: string;
    output: any;
    config?: {
      target_company_source?: 'current' | 'from_input';
      auto_approve_l4?: boolean;
      require_approval_create?: boolean;
    };
  }> = [];

  // Process each relevant workflow
  for (const workflow of relevantWorkflows) {
    const nodes: Node[] = workflow.nodes || [];
    const edges: Edge[] = workflow.edges || [];
    const variables = workflow.variables || [];
    const workflowId = workflow.id;

    // Find the source node
    const sourceNode = findSourceNode(nodes);
    if (!sourceNode) continue;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const results = new Map<string, any>();
    const executionStats = {
      executed: [] as string[],
      cached: [] as string[],
    };

    // Step 1: Hash the incoming data
    const incomingDataStr = JSON.stringify(submission.raw_data);
    const incomingHash = await hashContent(incomingDataStr);

    // Step 2: Store source node data with new hash
    const { data: existingSource } = await supabase
      .from('company_node_data')
      .select('version, content_hash')
      .match({ company_id, workflow_id: workflowId, node_id: sourceNode.id })
      .single();

    const sourceHashChanged = existingSource?.content_hash !== incomingHash;
    const sourceVersion = (existingSource?.version || 0) + 1;

    await supabase
      .from('company_node_data')
      .upsert({
        company_id,
        workflow_id: workflowId,
        node_id: sourceNode.id,
        node_type: sourceNode.type,
        node_label: sourceNode.label || sourceNode.data?.label || sourceNode.type,
        data: { output: submission.raw_data },
        content_hash: incomingHash,
        dependency_hashes: {},
        last_executed_at: new Date().toISOString(),
        version: sourceVersion,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'company_id,workflow_id,node_id'
      });

    results.set(sourceNode.id, incomingDataStr);
    executionStats.executed.push(sourceNode.id);

    // If source hash unchanged AND not force mode, skip cascade for this workflow
    if (!force && !sourceHashChanged && existingSource?.content_hash) {
      workflowResults.push({
        workflow_id: workflowId,
        workflow_name: workflow.name,
        status: 'cached',
        message: 'Data unchanged - no cascade needed',
        executed: [],
        cached: nodes.map(n => n.id),
      });
      continue;
    }

    if (force) {
      console.log(`[run-company-workflows] Force mode enabled - will re-execute all nodes for workflow "${workflow.name}"`);
    }

    // Step 3: Topological sort all nodes
    const sortedNodeIds = topologicalSort(nodes, edges);
    
    // Log execution order for debugging
    console.log(`[run-company-workflows] Execution order for workflow "${workflow.name}":`);
    sortedNodeIds.forEach((nodeId, idx) => {
      const n = nodeMap.get(nodeId);
      const deps = getAllDependencies(n!, edges);
      const depLabels = deps.map(d => {
        const depNode = nodeMap.get(d.nodeId);
        return d.workflowId ? `${d.workflowId}:${d.nodeId}` : (depNode?.label || d.nodeId);
      }).join(', ');
      console.log(`  [${idx}] ${n?.label || nodeId} (${n?.type}) <- [${depLabels || 'none'}]`);
    });

    // Step 3.4: If start_from_node_id is specified, filter to only that node + downstream
    let nodesToExecute = new Set<string>(sortedNodeIds);
    
    if (start_from_node_id) {
      // Build set of nodes to execute: start node + all downstream
      const downstreamNodes = new Set<string>([start_from_node_id]);
      
      const addDownstream = (nodeId: string) => {
        // 1. Agent nodes referencing this node as sourceNodeId
        for (const node of nodes) {
          if (node.type === 'agent' && 
              node.config?.sourceNodeId === nodeId && 
              !downstreamNodes.has(node.id)) {
            downstreamNodes.add(node.id);
            addDownstream(node.id);
          }
        }
        
        // 2. ANY node type with promptParts dependency on this node
        for (const node of nodes) {
          if (node.config?.promptParts && !downstreamNodes.has(node.id)) {
            const hasDep = node.config.promptParts.some(
              (p: any) => p.type === 'dependency' && p.value === nodeId
            );
            if (hasDep) {
              downstreamNodes.add(node.id);
              addDownstream(node.id);
            }
          }
        }
        
        // 3. Variable nodes with ssotMapDependencies referencing this node
        for (const node of nodes) {
          if (node.type === 'variable' && 
              node.config?.ssotMapMode && 
              node.config?.ssotMapDependencies &&
              !downstreamNodes.has(node.id)) {
            const hasDep = node.config.ssotMapDependencies.some(
              (dep: any) => dep.nodeId === nodeId
            );
            if (hasDep) {
              downstreamNodes.add(node.id);
              addDownstream(node.id);
            }
          }
        }
      };
      
      addDownstream(start_from_node_id);
      nodesToExecute = downstreamNodes;
      
      console.log(`[run-company-workflows] start_from_node_id: ${start_from_node_id}, executing ${nodesToExecute.size} nodes:`, 
        Array.from(nodesToExecute).map(id => nodeMap.get(id)?.label || id).join(', '));
    }

    // Step 3.5: Build paused nodes set and propagate to downstream
    const pausedNodes = new Set<string>();
    const pausedDownstream = new Set<string>();

    // Find all directly paused nodes
    for (const node of nodes) {
      if (node.config?.paused === true) {
        pausedNodes.add(node.id);
      }
    }

    // Propagate pause to all downstream nodes using promptParts-based discovery
    const addDownstreamToPaused = (nodeId: string) => {
      // Agent nodes referencing this node
      for (const node of nodes) {
        if (node.type === 'agent' && node.config?.sourceNodeId === nodeId && !pausedDownstream.has(node.id)) {
          pausedDownstream.add(node.id);
          addDownstreamToPaused(node.id);
        }
      }
      // Any node with promptParts dependency
      for (const node of nodes) {
        if (node.config?.promptParts && !pausedDownstream.has(node.id)) {
          const hasDep = node.config.promptParts.some(
            (p: any) => p.type === 'dependency' && p.value === nodeId
          );
          if (hasDep) {
            pausedDownstream.add(node.id);
            addDownstreamToPaused(node.id);
          }
        }
      }
      // Variable nodes with ssotMapDependencies
      for (const node of nodes) {
        if (node.type === 'variable' && node.config?.ssotMapMode && node.config?.ssotMapDependencies && !pausedDownstream.has(node.id)) {
          const hasDep = node.config.ssotMapDependencies.some((dep: any) => dep.nodeId === nodeId);
          if (hasDep) {
            pausedDownstream.add(node.id);
            addDownstreamToPaused(node.id);
          }
        }
      }
    };

    for (const pausedId of pausedNodes) {
      addDownstreamToPaused(pausedId);
    }

    if (pausedNodes.size > 0) {
      console.log(`[run-company-workflows] Paused nodes: ${pausedNodes.size}, Downstream blocked: ${pausedDownstream.size}`);
    }

    // Step 4: Execute cascade
    for (const nodeId of sortedNodeIds) {
      if (nodeId === sourceNode.id) continue;

      // Skip nodes not in the execution set (when start_from_node_id is specified)
      if (!nodesToExecute.has(nodeId)) {
        // Load cached output for skipped nodes so downstream can use them
        const { data: cachedData } = await supabase
          .from('company_node_data')
          .select('data')
          .match({ company_id, workflow_id: workflowId, node_id: nodeId })
          .single();
        
        if (cachedData?.data?.output) {
          results.set(nodeId, cachedData.data.output);
        }
        continue;
      }

      // Skip paused nodes and their downstream
      if (pausedNodes.has(nodeId) || pausedDownstream.has(nodeId)) {
        console.log(`[run-company-workflows] Skipping node ${nodeId}: paused or downstream of paused`);
        executionStats.cached.push(nodeId);
        continue;
      }

      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const allDeps = getAllDependencies(node, edges);

      let needsExecution = false;
      let executionReason = 'cache_valid';

      const { data: nodeData } = await supabase
        .from('company_node_data')
        .select('dependency_hashes, content_hash')
        .match({ company_id, workflow_id: workflowId, node_id: nodeId })
        .single();

      // Force mode always executes all nodes
      if (force) {
        needsExecution = true;
        executionReason = 'force_rerun';
      } else if (!nodeData || !nodeData.content_hash) {
        needsExecution = true;
        executionReason = 'never_executed';
      } else {
        const storedDepHashes = nodeData.dependency_hashes || {};
        
        // Get promptParts to check trigger settings
        const promptParts: PromptPart[] = node.config?.promptParts || [];
        
        for (const dep of allDeps) {
          // Check if the dependency node has fetchLive enabled (skip hash tracking)
          const depNode = nodes.find((n: Node) => n.id === dep.nodeId);
          if (depNode?.config?.fetchLive === true) {
            console.log(`[run-company-workflows] Skipping hash tracking for live-fetch node: ${dep.nodeId}`);
            continue;
          }
          
          // Check if this dependency should trigger execution
          const promptPart = promptParts.find(p => 
            p.type === 'dependency' && 
            p.value === dep.nodeId &&
            (!p.workflowId || p.workflowId === dep.workflowId)
          );
          
          // Default to triggering if not specified (backward compatible)
          const shouldTrigger = promptPart?.triggersExecution ?? true;
          
          if (!shouldTrigger) {
            console.log(`[run-company-workflows] Skipping trigger check for non-triggering dep: ${dep.nodeId}`);
            continue;  // Skip this dependency's trigger check
          }
          
          // Use cross-workflow lookup: fall back to current workflow if not specified
          const targetWorkflowId = dep.workflowId || workflowId;
          const { data: depData } = await supabase
            .from('company_node_data')
            .select('content_hash')
            .match({ company_id, workflow_id: targetWorkflowId, node_id: dep.nodeId })
            .single();

          const currentHash = depData?.content_hash;
          // Store hashes with composite key for cross-workflow deps
          const depKey = dep.workflowId ? `${dep.workflowId}:${dep.nodeId}` : dep.nodeId;
          const storedHash = storedDepHashes[depKey];

          if (currentHash !== storedHash) {
            needsExecution = true;
            executionReason = `dependency_changed:${dep.nodeId}`;
            break;
          }
        }
      }

      if (!needsExecution) {
        const { data: cached } = await supabase
          .from('company_node_data')
          .select('data')
          .match({ company_id, workflow_id: workflowId, node_id: nodeId })
          .single();

        results.set(nodeId, cached?.data?.output || '');
        executionStats.cached.push(nodeId);
        continue;
      }

      executionStats.executed.push(nodeId);

      // Execute node based on type
      let output: any = '';
      let evaluationResult: EvaluationResult | null = null;
      let promptUsedForEvaluation: string | null = null;
      let referenceDataForEvaluation: string | null = null;

      // Check if any dependency contains the stop trigger (for promptTemplate nodes)
      if (node.type === 'promptTemplate') {
        let hasStopTrigger = false;
        const allDeps = getAllDependencies(node, edges);
        
        for (const dep of allDeps) {
          let depOutput: string | undefined;
          
          if (dep.workflowId) {
            // Cross-workflow dependency
            const { data: crossData } = await supabase
              .from('company_node_data')
              .select('data')
              .match({ company_id, workflow_id: dep.workflowId, node_id: dep.nodeId })
              .maybeSingle();
            depOutput = crossData?.data?.output;
          } else {
            // Same-workflow dependency - check in-memory first, then database
            const memResult = results.get(dep.nodeId);
            if (memResult !== undefined) {
              depOutput = typeof memResult === 'string' ? memResult : JSON.stringify(memResult);
            } else {
              const { data: localData } = await supabase
                .from('company_node_data')
                .select('data')
                .match({ company_id, workflow_id: workflowId, node_id: dep.nodeId })
                .maybeSingle();
              depOutput = localData?.data?.output;
            }
          }
          
          if (typeof depOutput === 'string' && depOutput.includes(STOP_TRIGGER_CODE)) {
            hasStopTrigger = true;
            console.log(`[run-company-workflows] Stop trigger detected in dependency ${dep.nodeId}`);
            break;
          }
        }
        
        if (hasStopTrigger) {
          console.log(`[run-company-workflows] Skipping node "${node.label || nodeId}": stop trigger in dependency`);
          output = STOP_TRIGGER_CODE; // Propagate the stop
          
          // Store the stop trigger output and continue to next node
          const outputHash = await hashContent(output);
          await supabase
            .from('company_node_data')
            .update({
              data: { output },
              content_hash: outputHash,
              last_executed_at: new Date().toISOString(),
              version: 1,
            })
            .match({ company_id, workflow_id: workflowId, node_id: nodeId });
          
          results.set(nodeId, output);
          continue;
        }
      }

      if (node.type === 'promptTemplate') {
        const config = node.config || {};
        const model = mapModelName(config.model || 'gpt-5-mini');
        const temperature = config.temperature || 0.7;
        const maxTokens = config.maxTokens || config.max_tokens || 8000;

        const promptParts: PromptPart[] = config.promptParts || [];
        let prompt = '';
        let referenceData = '';
        let latestDependencyUpdate: string | null = null;
        let lastPartType: string | null = null;
        let systemPromptContent = '';
        
        // Check for system prompt references in promptParts and fetch from database
        for (const part of promptParts) {
          if (part.systemPromptId) {
            const { data: sysPromptData, error: sysPromptError } = await supabase
              .from('system_prompts')
              .select('prompt')
              .eq('id', part.systemPromptId)
              .single();
            
            if (sysPromptError) {
              console.warn(`[run-company-workflows] System prompt not found: ${part.systemPromptId} (${part.systemPromptName})`);
            } else if (sysPromptData) {
              // Use system prompt as the system message
              systemPromptContent = sysPromptData.prompt;
              console.log(`[run-company-workflows] Using system prompt: ${part.systemPromptName}`);
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
              console.log(`[run-company-workflows] Fetching live SSOT data for dependency: ${part.value}`);
              
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
                company_id,  // Include company context
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
              
              const depStr = JSON.stringify(schemaSnapshot, null, 2);
              prompt += depStr;
              referenceData += depStr + '\n';
              lastPartType = 'dependency';
              console.log(`[run-company-workflows] Injected live SSOT: ${schemaSnapshot.total_domains} domains, ${schemaSnapshot.total_fields} fields, ${schemaSnapshot.total_context_facts} context facts (with hierarchy)`);
            } else {
              // Standard dependency resolution
              // First check in-memory results (same workflow execution)
              let depResult = results.get(part.value);
              
              // If not found and cross-workflow dependency, fetch from database
              if (depResult === undefined && part.workflowId) {
                const { data: crossWorkflowData } = await supabase
                  .from('company_node_data')
                  .select('data, updated_at')
                  .match({ company_id, workflow_id: part.workflowId, node_id: part.value })
                  .single();
                depResult = crossWorkflowData?.data?.output;
                // Track latest dependency update for E2E latency
                if (crossWorkflowData?.updated_at) {
                  if (!latestDependencyUpdate || crossWorkflowData.updated_at > latestDependencyUpdate) {
                    latestDependencyUpdate = crossWorkflowData.updated_at;
                  }
                }
                console.log(`[run-company-workflows] Cross-workflow dep fetch: ${part.workflowId}:${part.value} = ${depResult ? 'found' : 'not found'}`);
              } else if (part.type === 'dependency') {
                // For same-workflow deps, check updated_at
                const { data: localDepData } = await supabase
                  .from('company_node_data')
                  .select('updated_at')
                  .match({ company_id, workflow_id: workflowId, node_id: part.value })
                  .maybeSingle();
                if (localDepData?.updated_at) {
                  if (!latestDependencyUpdate || localDepData.updated_at > latestDependencyUpdate) {
                    latestDependencyUpdate = localDepData.updated_at;
                  }
                }
              }
              
              if (depResult !== undefined) {
                const rawDepStr = typeof depResult === 'string' ? depResult : JSON.stringify(depResult, null, 2);
                const depStr = typeof rawDepStr === 'string' ? stripCodeFences(rawDepStr) : rawDepStr;
                prompt += depStr;
                referenceData += depStr + '\n';  // Collect for evaluation
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
              referenceData += `[Framework: ${framework.name}]\n`;
              lastPartType = 'framework';
              console.log(`[run-company-workflows] Added framework "${framework.name}" to prompt`);
            } else {
              console.warn(`[run-company-workflows] Framework not found: ${part.value}`);
              prompt += `\n[Framework not found: ${part.frameworkName || part.value}]\n`;
            }
          }
        }

        // Append stop trigger instruction if enabled
        if (config.enableStopTrigger) {
          prompt += STOP_TRIGGER_INSTRUCTION;
        }

        // Skip AI call if prompt is empty or only whitespace
        const trimmedPrompt = prompt.trim();
        if (!trimmedPrompt) {
          console.warn(`[run-company-workflows] Skipping AI call for node ${nodeId}: empty prompt`);
          output = '[No data available - prompt was empty]';
        } else {
          console.log(`[run-company-workflows] Calling AI for node "${node.label || nodeId}" with model ${model}`);
          console.log(`[run-company-workflows] Prompt length: ${trimmedPrompt.length} chars, first 500: ${trimmedPrompt.substring(0, 500)}...`);
          
          // Store for evaluation
          promptUsedForEvaluation = trimmedPrompt;
          referenceDataForEvaluation = referenceData.trim() || trimmedPrompt;
          
          // Determine API endpoint and auth based on model provider
          const isPerplexityModel = model.startsWith('perplexity/');
          const perplexityApiKey = Deno.env.get('PERPLEXITY_API_KEY');
          const apiUrl = isPerplexityModel 
            ? 'https://api.perplexity.ai/chat/completions'
            : 'https://ai.gateway.lovable.dev/v1/chat/completions';
          const apiKey = isPerplexityModel ? perplexityApiKey : lovableApiKey;
          
          if (!apiKey) {
            console.error(`[run-company-workflows] Missing API key for ${isPerplexityModel ? 'Perplexity' : 'Lovable'}`);
            output = `[Error: ${isPerplexityModel ? 'PERPLEXITY_API_KEY' : 'LOVABLE_API_KEY'} not configured]`;
            continue;
          }
          
          // For Perplexity, strip the provider prefix from model name
          const apiModel = isPerplexityModel ? model.replace('perplexity/', '') : model;

          const requestBody: any = {
            model: apiModel,
            messages: [
              ...(systemPromptContent ? [{ role: 'system', content: systemPromptContent }] : []),
              { role: 'user', content: trimmedPrompt }
            ],
            max_completion_tokens: maxTokens,
          };
          
          // Add Google Search grounding for Gemini models when webSearch is enabled
          // (Perplexity models have built-in web search)
          if (!isPerplexityModel && config.webSearch && model.startsWith('google/')) {
            requestBody.tools = [{ googleSearch: {} }];
          }
          
          // Track AI call timing
          const aiCallStart = Date.now();
          
          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
          });

          // Check for HTTP errors
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[run-company-workflows] AI API error for node "${node.label || nodeId}": ${response.status} - ${errorText}`);
            
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
                console.log(`[run-company-workflows] Created/updated system alert for model ${model}`);
              } catch (alertError) {
                console.error('[run-company-workflows] Failed to create system alert:', alertError);
              }
            }
            
            output = `[AI Error: ${response.status}]`;
          } else {
            const aiCallDuration = Date.now() - aiCallStart;
            const data = await response.json();
            console.log(`[run-company-workflows] AI response for node "${node.label || nodeId}":`, {
              hasChoices: !!data.choices,
              choicesLength: data.choices?.length,
              contentLength: data.choices?.[0]?.message?.content?.length,
              usage: data.usage,
              aiCallDurationMs: aiCallDuration,
            });
            
            output = stripCodeFences(data.choices?.[0]?.message?.content || '');
            const finishReason = data.choices?.[0]?.finish_reason;
            
            if (!output) {
              console.warn(`[run-company-workflows] Empty AI response for node "${node.label || nodeId}" - full response:`, JSON.stringify(data));
            }
            
            // Detect max tokens truncation
            if (finishReason === 'length') {
              console.warn(`[run-company-workflows] Output truncated for node "${node.label || nodeId}" - hit max_tokens limit (${maxTokens})`);
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
                console.error('[run-company-workflows] Failed to create max_tokens alert:', alertError);
              }
            }
            
            // Log AI usage with timing
            const usage = data.usage;
            if (usage) {
              const promptTokens = usage.prompt_tokens || 0;
              const completionTokens = usage.completion_tokens || 0;
              const totalTokens = usage.total_tokens || promptTokens + completionTokens;
              
              console.log(`[run-company-workflows] AI usage for node "${node.label || nodeId}": ${promptTokens} prompt + ${completionTokens} completion = ${totalTokens} total tokens, ${aiCallDuration}ms`);
              
              const cost = calculateCost(model, promptTokens, completionTokens, pricingOverrides);
              console.log(`[run-company-workflows] Estimated cost: $${cost.toFixed(6)}`);
              
              await supabase.from('ai_usage_logs').insert({
                workflow_id: workflowId,
                company_id,
                node_id: nodeId,
                model,
                prompt_tokens: promptTokens,
                completion_tokens: completionTokens,
                total_tokens: totalTokens,
                estimated_cost: cost,
                execution_time_ms: aiCallDuration,
                dependency_changed_at: latestDependencyUpdate,
              });
            }
            
            // Run quality evaluations on successful generation
            if (output && typeof output === 'string' && output.length > 10 && !output.startsWith('[')) {
              try {
                console.log(`[run-company-workflows] Running quality evaluation for node "${node.label || nodeId}"...`);
                evaluationResult = await evaluateGeneration(
                  promptUsedForEvaluation || trimmedPrompt,
                  referenceDataForEvaluation || '',
                  output,
                  supabase,
                  lovableApiKey,
                  workflowId,
                  company_id,
                  nodeId,
                  pricingOverrides,
                  metricToggles
                );
                console.log(`[run-company-workflows] Evaluation for node "${node.label || nodeId}": overall=${evaluationResult.overallScore}, flags=${evaluationResult.flags.join(',') || 'none'}`);
              } catch (evalError) {
                console.error(`[run-company-workflows] Evaluation failed for node "${node.label || nodeId}":`, evalError);
                // Continue without evaluation data - don't fail the workflow
              }
            }
          }
        }
      } else if (node.type === 'promptPiece') {
        const config = node.config || {};
        const promptParts: PromptPart[] = config.promptParts || [];
        let text = '';
        
        for (const part of promptParts) {
          if (part.type === 'text' || part.type === 'prompt') {
            text += part.value;
          } else if (part.type === 'dependency') {
            // First check in-memory results (same workflow execution)
            let depResult = results.get(part.value);
            
            // If not found and cross-workflow dependency, fetch from database
            if (depResult === undefined && part.workflowId) {
              const { data: crossWorkflowData } = await supabase
                .from('company_node_data')
                .select('data')
                .match({ company_id, workflow_id: part.workflowId, node_id: part.value })
                .single();
              depResult = crossWorkflowData?.data?.output;
            }
            
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
        const config = node.config || {};
        
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
            company_id,  // Include company context
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
          console.log(`[run-company-workflows] SSOT Schema snapshot: ${schemaSnapshot.total_domains} domains, ${schemaSnapshot.total_fields} fields (with hierarchy)`);
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
                company_id, 
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
          console.log(`[run-company-workflows] Dataset node ${nodeId}: aggregated ${Object.keys(aggregatedData).length} dependencies`);
        } else if (config.sourceType === 'shared_cache' && config.sharedCacheId) {
          // Fetch data from shared cache
          const { data: cacheData } = await supabase
            .from('shared_cache_data')
            .select('data, node_label, updated_at')
            .match({ 
              shared_cache_id: config.sharedCacheId,
              company_id 
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
            console.log(`[run-company-workflows] Shared cache ${config.sharedCacheName || config.sharedCacheId}: loaded ${cacheData.length} entries`);
          } else {
            output = JSON.stringify({});
            console.log(`[run-company-workflows] Shared cache ${config.sharedCacheName || config.sharedCacheId}: no data found for company ${company_id}`);
          }
        } else {
          output = JSON.stringify(config.data || []);
        }
      } else if (node.type === 'variable') {
        const config = node.config || {};
        
        // Check for SSOT Map mode (Transformation node)
        if (config.ssotMapMode && config.ssotMapDependencies) {
          const mappings = config.ssotMapDependencies || [];
          const mapResults: any[] = [];
          
          console.log(`[run-company-workflows] Processing SSOT Map node "${node.label || nodeId}" with ${mappings.length} mappings`);
          
          for (const mapping of mappings) {
            if (!mapping.targetDomain || !mapping.targetFieldKey) {
              console.log(`[run-company-workflows] Skipping mapping - missing target: domain=${mapping.targetDomain}, field=${mapping.targetFieldKey}`);
              continue;
            }
            
            // Get dependency output from results or fetch cross-workflow
            let depOutput = results.get(mapping.nodeId);
            if (depOutput === undefined && mapping.workflowId) {
              const { data: crossData } = await supabase
                .from('company_node_data')
                .select('data')
                .match({ company_id, workflow_id: mapping.workflowId, node_id: mapping.nodeId })
                .single();
              depOutput = crossData?.data?.output;
            }
            
            if (depOutput === undefined) {
              console.log(`[run-company-workflows] No output found for dependency ${mapping.nodeId}`);
              mapResults.push({ field: `${mapping.targetDomain}.${mapping.targetFieldKey}`, status: 'skipped', reason: 'no_output' });
              continue;
            }
            
            // Strip "output." prefix if present since results map already contains unwrapped output
            let adjustedPath = mapping.jsonPath;
            if (adjustedPath.startsWith('output.')) {
              adjustedPath = adjustedPath.substring(7); // Remove "output." prefix
            }
            
            // Extract value using JSON path
            const extractedValue = getValueByPath(depOutput, adjustedPath);
            if (extractedValue === undefined) {
              console.log(`[run-company-workflows] No value at path "${mapping.jsonPath}" (adjusted: "${adjustedPath}") in dependency output`);
              mapResults.push({ field: `${mapping.targetDomain}.${mapping.targetFieldKey}`, status: 'skipped', reason: `No value at path: ${mapping.jsonPath}` });
              continue;
            }
            
            // Upsert to company_master_data
            const { data: existing } = await supabase
              .from('company_master_data')
              .select('id, version')
              .match({
                company_id,
                domain: mapping.targetDomain,
                field_key: mapping.targetFieldKey
              })
              .maybeSingle();
            
            const sourceReference = {
              workflow_id: workflowId,
              node_id: nodeId,
              node_label: node.label || nodeId,
              source_node_id: mapping.nodeId,
              source_node_label: mapping.nodeLabel,
              json_path: mapping.jsonPath,
              mapped_at: new Date().toISOString()
            };
            
            if (existing) {
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
                console.error(`[run-company-workflows] Failed to update master data:`, updateError);
                mapResults.push({ field: `${mapping.targetDomain}.${mapping.targetFieldKey}`, status: 'error', reason: updateError.message });
              } else {
                mapResults.push({ field: `${mapping.targetDomain}.${mapping.targetFieldKey}`, status: 'updated', value: extractedValue });
              }
            } else {
              const { error: insertError } = await supabase
                .from('company_master_data')
                .insert({
                  company_id,
                  domain: mapping.targetDomain,
                  field_key: mapping.targetFieldKey,
                  field_value: extractedValue,
                  source_type: 'generated',
                  source_reference: sourceReference,
                  version: 1
                });
              
              if (insertError) {
                console.error(`[run-company-workflows] Failed to insert master data:`, insertError);
                mapResults.push({ field: `${mapping.targetDomain}.${mapping.targetFieldKey}`, status: 'error', reason: insertError.message });
              } else {
                mapResults.push({ field: `${mapping.targetDomain}.${mapping.targetFieldKey}`, status: 'created', value: extractedValue });
              }
            }
          }
          
          // Trigger SSOT sync to Abi if any fields were written
          const successCount = mapResults.filter(r => r.status === 'updated' || r.status === 'created').length;
          if (successCount > 0) {
            const changedDomains = [...new Set(mapResults.filter(r => r.status === 'updated' || r.status === 'created').map(r => r.field.split('.')[0]))];
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            
            console.log(`[run-company-workflows] Triggering sync-ssot-to-abi for domains: ${changedDomains.join(', ')}`);
            
            fetch(`${supabaseUrl}/functions/v1/sync-ssot-to-abi`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({
                company_id,
                sync_type: 'incremental',
                changed_domains: changedDomains
              })
            }).catch(err => console.error('[run-company-workflows] Failed to trigger SSOT sync:', err));
          }
          
          output = JSON.stringify({
            mappings_processed: mappings.length,
            mappings_written: successCount,
            results: mapResults
          });
          console.log(`[run-company-workflows] SSOT Map completed: ${successCount}/${mappings.length} fields written`);
        } else {
          // Standard variable lookup
          const varName = config.name;
          const variable = variables.find((v: any) => v.name === varName);
          output = variable?.value || '';
        }
      } else if (node.type === 'framework') {
        const config = node.config || {};
        
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
      } else if (node.type === 'integration') {
        // Handle integration nodes (e.g., Firecrawl)
        const config = node.config || {};
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
              if (depResult === undefined && part.workflowId) {
                const { data: crossWorkflowData } = await supabase
                  .from('company_node_data')
                  .select('data')
                  .match({ company_id, workflow_id: part.workflowId, node_id: part.value })
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
              companyId: company_id,
              workflowId,
              nodeId,
              nodeLabel: node.label || node.data?.label || null,
            }),
          });
          
          const firecrawlData = await firecrawlResponse.json();
          
          if (!firecrawlResponse.ok || !firecrawlData.success) {
            console.error(`[run-company-workflows] Firecrawl error for node ${nodeId}:`, firecrawlData.error);
            output = `[Firecrawl error: ${firecrawlData.error || 'Unknown error'}]`;
          } else {
            output = firecrawlData.output || '';
            console.log(`[run-company-workflows] Firecrawl ${config.capability} completed for node ${nodeId}`);
          }
        } else {
          output = `[Unknown integration: ${integrationId}]`;
        }
      } else if (node.type === 'agent') {
        // ============= EXECUTION AGENT NODE PROCESSING =============
        // Process agent nodes immediately during workflow execution
        const agentConfig = node.config || {};
        const executionType = agentConfig.executionType || 'ssot_update';
        const sourceNodeId = agentConfig.sourceNodeId;
        
        console.log(`[run-company-workflows] Processing agent node "${node.label || nodeId}" type=${executionType}`);
        
        if (!sourceNodeId) {
          output = '[Agent not configured: No source node selected]';
          console.warn(`[run-company-workflows] Agent node "${node.label}" has no source configured`);
        } else if (executionType === 'ssot_update') {
          // Get the source node's output
          let sourceOutput = results.get(sourceNodeId);
          
          // If not in memory, fetch from database
          if (sourceOutput === undefined) {
            const { data: sourceData } = await supabase
              .from('company_node_data')
              .select('data')
              .match({ company_id, workflow_id: workflowId, node_id: sourceNodeId })
              .maybeSingle();
            sourceOutput = sourceData?.data?.output;
          }
          
          if (!sourceOutput) {
            output = `[Agent error: Source node "${agentConfig.sourceNodeLabel || sourceNodeId}" has no output]`;
            console.warn(`[run-company-workflows] Agent source node has no output`);
          } else {
            // Process SSOT change plan immediately
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
            
            // Parse the source output as SSOT_CHANGE_PLAN
            let changePlan: any = null;
            let parseError: string | null = null;
            
            console.log(`[run-company-workflows] Agent processing SSOT from "${agentConfig.sourceNodeLabel}"`);
            
            if (typeof sourceOutput === 'string') {
              // Try to extract JSON from potential markdown code blocks
              let jsonStr = sourceOutput.trim();
              const jsonMatch = sourceOutput.match(/```(?:json)?\s*([\s\S]*?)```/);
              if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
              }
              
              try {
                changePlan = JSON.parse(jsonStr);
              } catch (e: any) {
                parseError = e.message;
                console.error(`[run-company-workflows] Agent failed to parse SSOT JSON: ${parseError}`);
                
                // Detect JSON truncation by checking bracket balance
                if (jsonStr.length > 0) {
                  const openBraces = (jsonStr.match(/\{/g) || []).length;
                  const closeBraces = (jsonStr.match(/\}/g) || []).length;
                  const openBrackets = (jsonStr.match(/\[/g) || []).length;
                  const closeBrackets = (jsonStr.match(/\]/g) || []).length;
                  
                  const missingBraces = openBraces - closeBraces;
                  const missingBrackets = openBrackets - closeBrackets;
                  
                  if (missingBraces > 0 || missingBrackets > 0) {
                    console.warn(`[run-company-workflows] JSON appears TRUNCATED: ${openBraces} '{' vs ${closeBraces} '}', ${openBrackets} '[' vs ${closeBrackets} ']'. Content length: ${jsonStr.length} chars`);
                    parseError = `JSON appears truncated (missing ${missingBraces} '}' and ${missingBrackets} ']'). The source node may need a higher max_tokens setting. Current output was ${jsonStr.length} characters.`;
                  }
                }
              }
            } else if (typeof sourceOutput === 'object' && sourceOutput !== null) {
              changePlan = sourceOutput;
            }
            
            if (!changePlan) {
              output = `[Agent error: Could not parse SSOT change plan from source. ${parseError || 'Invalid format'}]`;
            } else {
              // Validate required fields
              const validationErrors: string[] = [];
              if (!Array.isArray(changePlan.plan_summary)) {
                validationErrors.push('Missing "plan_summary"');
              }
              if (!Array.isArray(changePlan.validated_changes) && 
                  (!Array.isArray(changePlan.new_structure_additions) || changePlan.new_structure_additions.length === 0)) {
                validationErrors.push('Missing "validated_changes" or "new_structure_additions"');
              }
              
              if (validationErrors.length > 0) {
                output = `[Agent error: Invalid SSOT_CHANGE_PLAN - ${validationErrors.join(', ')}]`;
                console.error(`[run-company-workflows] Agent SSOT validation failed:`, validationErrors);
              } else {
                // Execute SSOT changes
                console.log(`[run-company-workflows] Agent executing SSOT: ${changePlan.validated_changes?.length || 0} changes`);
                
                try {
                  const executeResponse = await fetch(`${supabaseUrl}/functions/v1/execute-ssot-changes`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabaseServiceKey}`,
                    },
                    body: JSON.stringify({
                      company_id,
                      workflow_id: workflowId,
                      node_id: nodeId,
                      execution_run_id: submission_id,
                      plan: changePlan,
                      config: {
                        mode: agentConfig.ssotConfig?.mode || (agentConfig.ssotConfig?.schema_only ? 'schema' : 'data'),
                        target_company_source: agentConfig.ssotConfig?.target_company_source || 'current',
                        auto_approve_l4: agentConfig.ssotConfig?.auto_approve_l4 || false,
                        require_approval_create: agentConfig.ssotConfig?.require_approval_create ?? true,
                      },
                    }),
                  });
                  
                  const executeResult = await executeResponse.json();
                  console.log(`[run-company-workflows] Agent SSOT execution result:`, executeResult);
                  
                  output = JSON.stringify({
                    status: executeResult.success ? 'success' : 'error',
                    changes_processed: changePlan.validated_changes?.length || 0,
                    pending_approvals: executeResult.pending_count || 0,
                    auto_approved: executeResult.auto_approved_count || 0,
                    message: executeResult.message || 'SSOT changes processed',
                  });
                } catch (execError: any) {
                  output = `[Agent error: Failed to execute SSOT changes - ${execError.message}]`;
                  console.error(`[run-company-workflows] Agent execution error:`, execError);
                }
              }
            }
          }
        } else {
          output = `[Agent error: Unknown execution type "${executionType}"]`;
        }
      }

      results.set(nodeId, output);

      // Store result with content hash
      const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
      const contentHash = await hashContent(outputStr);
      
      const dependencyHashes: { [key: string]: string } = {};
      for (const dep of allDeps) {
        // Skip fetchLive dependencies from hash tracking
        const depNode = nodes.find((n: Node) => n.id === dep.nodeId);
        if (depNode?.config?.fetchLive === true) {
          continue; // Don't track live-fetch dependencies
        }
        
        // Use cross-workflow lookup for storing dependency hashes
        const targetWorkflowId = dep.workflowId || workflowId;
        const { data: depData } = await supabase
          .from('company_node_data')
          .select('content_hash')
          .match({ company_id, workflow_id: targetWorkflowId, node_id: dep.nodeId })
          .single();
        if (depData?.content_hash) {
          // Store with composite key for cross-workflow deps
          const depKey = dep.workflowId ? `${dep.workflowId}:${dep.nodeId}` : dep.nodeId;
          dependencyHashes[depKey] = depData.content_hash;
        }
      }

      const { data: existing } = await supabase
        .from('company_node_data')
        .select('version')
        .match({ company_id, workflow_id: workflowId, node_id: nodeId })
        .single();

      const newVersion = (existing?.version || 0) + 1;

      const updatedAt = new Date().toISOString();
      
      // Build data object with output and optional evaluation
      const nodeDataToStore: Record<string, any> = { output };
      
      // Add evaluation data if available (only for promptTemplate nodes)
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
            company_id,
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
          console.log(`[run-company-workflows] Stored evaluation history for node ${nodeId}`);
        } catch (histErr) {
          console.error('[run-company-workflows] Failed to store evaluation history:', histErr);
        }

        // Trigger alerts for low scores (using dynamic threshold from settings, only if metric is enabled)
        if (metricToggles.hallucination && evaluationResult.hallucination?.score !== undefined && evaluationResult.hallucination.score < alertThreshold) {
          try {
            await supabase.rpc('upsert_quality_alert', {
              _company_id: company_id,
              _company_name: companyName,
              _node_id: nodeId,
              _node_label: nodeLabel,
              _alert_type: 'hallucination',
              _score: evaluationResult.hallucination.score,
              _reasoning: evaluationResult.hallucination.reasoning || ''
            });
            console.log(`[run-company-workflows] Created hallucination alert for ${nodeLabel}`);
          } catch (alertErr) {
            console.error('[run-company-workflows] Failed to create hallucination alert:', alertErr);
          }
        }

        if (metricToggles.dataQuality && evaluationResult.dataQuality?.score !== undefined && evaluationResult.dataQuality.score < alertThreshold) {
          try {
            await supabase.rpc('upsert_quality_alert', {
              _company_id: company_id,
              _company_name: companyName,
              _node_id: nodeId,
              _node_label: nodeLabel,
              _alert_type: 'data_quality',
              _score: evaluationResult.dataQuality.score,
              _reasoning: evaluationResult.dataQuality.reasoning || ''
            });
            console.log(`[run-company-workflows] Created data quality alert for ${nodeLabel}`);

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
            console.error('[run-company-workflows] Failed to create data quality alert:', alertErr);
          }
        }

        if (metricToggles.complexity && evaluationResult.complexity?.score !== undefined && evaluationResult.complexity.score < alertThreshold) {
          try {
            await supabase.rpc('upsert_quality_alert', {
              _company_id: company_id,
              _company_name: companyName,
              _node_id: nodeId,
              _node_label: nodeLabel,
              _alert_type: 'complexity',
              _score: evaluationResult.complexity.score,
              _reasoning: evaluationResult.complexity.reasoning || ''
            });
            console.log(`[run-company-workflows] Created complexity alert for ${nodeLabel}`);
          } catch (alertErr) {
            console.error('[run-company-workflows] Failed to create complexity alert:', alertErr);
          }
        }
      }
      
      await supabase
        .from('company_node_data')
        .upsert({
          company_id,
          workflow_id: workflowId,
          node_id: nodeId,
          node_type: node.type,
          node_label: node.label || node.data?.label || node.type,
          data: nodeDataToStore,
          content_hash: contentHash,
          dependency_hashes: dependencyHashes,
          last_executed_at: updatedAt,
          version: newVersion,
          updated_at: updatedAt
        }, {
          onConflict: 'company_id,workflow_id,node_id'
        });

      // Track output destinations for sync
      // NEW FORMAT: Check unified outputDestinations array first
      if (node.config?.outputDestinations && Array.isArray(node.config.outputDestinations) && node.config.outputDestinations.length > 0) {
        for (const dest of node.config.outputDestinations) {
          if (!dest.enabled) continue;
          
          const destName = dest.destination_name || '';
          
          // Abi Platform
          if (destName.includes('Abi Platform') || destName === 'Abi Platform') {
            console.log(`[run-company-workflows] Node "${node.label || nodeId}" -> Abi Platform (new format)`);
            abiOutputNodes.push({
              node_id: nodeId,
              node_label: node.label || node.data?.label || node.type,
              node_type: node.type,
              workflow_id: workflowId,
              workflow_name: workflow.name,
              data: { output },
              version: newVersion,
              updated_at: updatedAt,
            });
          }
          // AbiVC Platform
          else if (destName.includes('AbiVC') || destName === 'AbiVC Platform') {
            console.log(`[run-company-workflows] Node "${node.label || nodeId}" -> AbiVC Platform (new format)`);
            abivcOutputNodes.push({
              node_id: nodeId,
              node_label: node.label || node.data?.label || node.type,
              node_type: node.type,
              workflow_id: workflowId,
              workflow_name: workflow.name,
              data: { output },
              version: newVersion,
              updated_at: updatedAt,
            });
          }
          // Master Data (SSOT)
          else if (destName.includes('Master Data') && dest.field_mapping?.domain && dest.field_mapping?.field_key) {
            console.log(`[run-company-workflows] Node "${node.label || nodeId}" -> Master Data: ${dest.field_mapping.domain}.${dest.field_mapping.field_key} (new format)`);
            masterDataOutputNodes.push({
              node_id: nodeId,
              node_label: node.label || node.data?.label || node.type,
              workflow_id: workflowId,
              domain: dest.field_mapping.domain,
              field_key: dest.field_mapping.field_key,
              value: output,
            });
          }
          // SSOT Update (AI-generated change plans)
          else if (destName.includes('SSOT Update') || destName === 'SSOT Update') {
            console.log(`[run-company-workflows] Node "${node.label || nodeId}" -> SSOT Update (new format)`);
            ssotUpdateNodes.push({
              node_id: nodeId,
              node_label: node.label || node.data?.label || node.type,
              workflow_id: workflowId,
              output: output,
              config: dest.config || {},
            });
          }
        }
      } else {
        // LEGACY FORMAT: Fall back to individual flags for backward compatibility
        if (node.config?.isAbiOutput) {
          console.log(`[run-company-workflows] Node "${node.label || nodeId}" marked as Abi output (legacy)`);
          abiOutputNodes.push({
            node_id: nodeId,
            node_label: node.label || node.data?.label || node.type,
            node_type: node.type,
            workflow_id: workflowId,
            workflow_name: workflow.name,
            data: { output },
            version: newVersion,
            updated_at: updatedAt,
          });
        }

        if (node.config?.isAbiVCOutput) {
          console.log(`[run-company-workflows] Node "${node.label || nodeId}" marked as AbiVC output (legacy)`);
          abivcOutputNodes.push({
            node_id: nodeId,
            node_label: node.label || node.data?.label || node.type,
            node_type: node.type,
            workflow_id: workflowId,
            workflow_name: workflow.name,
            data: { output },
            version: newVersion,
            updated_at: updatedAt,
          });
        }

        if (node.config?.isMasterDataOutput && node.config?.masterDataMapping) {
          const mapping = node.config.masterDataMapping;
          console.log(`[run-company-workflows] Node "${node.label || nodeId}" marked for Master Data: ${mapping.domain}.${mapping.field_key} (legacy)`);
          masterDataOutputNodes.push({
            node_id: nodeId,
            node_label: node.label || node.data?.label || node.type,
            workflow_id: workflowId,
            domain: mapping.domain,
            field_key: mapping.field_key,
            value: output,
          });
        }
      }

      // ============= SHARED CACHE OUTPUTS =============
      // Process shared cache outputs for generative nodes
      if (node.config?.sharedCacheOutputs && Array.isArray(node.config.sharedCacheOutputs)) {
        for (const cacheConfig of node.config.sharedCacheOutputs) {
          if (!cacheConfig.enabled) continue;
          
          const cacheId = cacheConfig.shared_cache_id;
          if (!cacheId) continue;
          
          console.log(`[run-company-workflows] Writing to shared cache: ${cacheConfig.shared_cache_name || cacheId}`);
          
          try {
            // Upsert to shared_cache_data
            const { error: cacheError } = await supabase
              .from('shared_cache_data')
              .upsert({
                shared_cache_id: cacheId,
                company_id,
                workflow_id: workflowId,
                node_id: nodeId,
                node_label: node.label || node.data?.label || node.type,
                data: { output },
                content_hash: contentHash,
                version: newVersion,
                updated_at: new Date().toISOString()
              }, {
                onConflict: 'shared_cache_id,company_id,workflow_id,node_id'
              });
              
            if (cacheError) {
              console.error(`[run-company-workflows] Failed to write to shared cache ${cacheId}:`, cacheError);
            } else {
              console.log(`[run-company-workflows] Successfully wrote to shared cache: ${cacheConfig.shared_cache_name}`);
            }
          } catch (cacheErr) {
            console.error(`[run-company-workflows] Error writing to shared cache:`, cacheErr);
          }
        }
      }
    }

    workflowResults.push({
      workflow_id: workflowId,
      workflow_name: workflow.name,
      status: 'completed',
      executed: executionStats.executed,
      cached: executionStats.cached,
    });
  }

  const executionTime = Date.now() - startTime;

  // Update submission status
  await supabase
    .from('company_data_submissions')
    .update({ 
      status: 'completed',
      processed_at: new Date().toISOString()
    })
    .eq('id', submission_id);

  // Trigger sync to Abi if there are Abi output nodes
  if (abiOutputNodes.length > 0) {
    console.log(`[run-company-workflows] Syncing ${abiOutputNodes.length} Abi output nodes to Abi platform`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    try {
      const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-output-to-abi`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          company_id,
          outputs: abiOutputNodes,
        }),
      });
      
      const syncResult = await syncResponse.json();
      console.log('[run-company-workflows] Abi sync result:', syncResult);
    } catch (syncError) {
      console.error('[run-company-workflows] Error syncing to Abi:', syncError);
      // Don't fail the workflow execution if sync fails
    }
  }

  // Trigger sync to AbiVC if there are AbiVC output nodes
  if (abivcOutputNodes.length > 0) {
    console.log(`[run-company-workflows] Syncing ${abivcOutputNodes.length} AbiVC output nodes to AbiVC platform`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    try {
      const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-output-to-abivc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          company_id,
          outputs: abivcOutputNodes,
        }),
      });
      
      const syncResult = await syncResponse.json();
      console.log('[run-company-workflows] AbiVC sync result:', syncResult);
    } catch (syncError) {
      console.error('[run-company-workflows] Error syncing to AbiVC:', syncError);
      // Don't fail the workflow execution if sync fails
    }
  }

  // Trigger sync to Master Data if there are master data output nodes
  if (masterDataOutputNodes.length > 0) {
    console.log(`[run-company-workflows] Syncing ${masterDataOutputNodes.length} Master Data output nodes`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    try {
      const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-to-master-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          company_id,
          outputs: masterDataOutputNodes,
        }),
      });
      
      const syncResult = await syncResponse.json();
      console.log('[run-company-workflows] Master Data sync result:', syncResult);
    } catch (syncError) {
      console.error('[run-company-workflows] Error syncing to Master Data:', syncError);
      // Don't fail the workflow execution if sync fails
    }
  }

  // Process SSOT Update nodes (AI-generated change plans)
  if (ssotUpdateNodes.length > 0) {
    console.log(`[run-company-workflows] Processing ${ssotUpdateNodes.length} SSOT Update nodes`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    for (const ssotNode of ssotUpdateNodes) {
      try {
        // Parse the output as SSOT_CHANGE_PLAN
        let changePlan: any = null;
        let parseError: string | null = null;
        
        console.log(`[run-company-workflows] Processing SSOT Update node "${ssotNode.node_label}"`);
        console.log(`[run-company-workflows] Raw output type: ${typeof ssotNode.output}, length: ${typeof ssotNode.output === 'string' ? ssotNode.output.length : 'n/a'}`);
        
        if (typeof ssotNode.output === 'string') {
          // Log first 500 chars for debugging
          console.log(`[run-company-workflows] SSOT output preview: ${ssotNode.output.substring(0, 500)}...`);
          
          // Try to extract JSON from potential markdown code blocks
          let jsonStr = ssotNode.output.trim();
          const jsonMatch = ssotNode.output.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
            console.log(`[run-company-workflows] Extracted JSON from code block, length: ${jsonStr.length}`);
          }
          
          try {
            changePlan = JSON.parse(jsonStr);
            console.log(`[run-company-workflows] Successfully parsed SSOT_CHANGE_PLAN JSON`);
          } catch (e: any) {
            parseError = e.message;
            console.error(`[run-company-workflows] SSOT Update node "${ssotNode.node_label}" output is not valid JSON: ${parseError}`);
            console.error(`[run-company-workflows] First 200 chars of attempted parse: ${jsonStr.substring(0, 200)}`);
          }
        } else if (typeof ssotNode.output === 'object' && ssotNode.output !== null) {
          changePlan = ssotNode.output;
          console.log(`[run-company-workflows] SSOT output is already an object`);
        }
        
        // Validate JSON structure
        if (!changePlan) {
          console.error(`[run-company-workflows] SSOT Update node "${ssotNode.node_label}": Failed to parse output as JSON. The node's prompt must be configured to output valid JSON with the SSOT_CHANGE_PLAN schema.`);
          continue;
        }
        
        // Validate required fields
        const validationErrors: string[] = [];
        if (!Array.isArray(changePlan.plan_summary)) {
          validationErrors.push('Missing or invalid "plan_summary" (expected array of strings)');
        }
        if (!Array.isArray(changePlan.validated_changes)) {
          if (!Array.isArray(changePlan.new_structure_additions) || changePlan.new_structure_additions.length === 0) {
            validationErrors.push('Missing or invalid "validated_changes" or "new_structure_additions" (expected at least one array)');
          }
        }
        
        // Validate each change has required fields
        if (Array.isArray(changePlan.validated_changes)) {
          for (let i = 0; i < changePlan.validated_changes.length; i++) {
            const change = changePlan.validated_changes[i];
            if (!change.change_id) validationErrors.push(`validated_changes[${i}]: missing change_id`);
            if (!change.target_path?.l1) validationErrors.push(`validated_changes[${i}]: missing target_path.l1 (domain)`);
            if (!change.target_level) validationErrors.push(`validated_changes[${i}]: missing target_level`);
            if (!change.action) validationErrors.push(`validated_changes[${i}]: missing action`);
            if (change.value_to_write === undefined) validationErrors.push(`validated_changes[${i}]: missing value_to_write`);
          }
        }
        
        if (validationErrors.length > 0) {
          console.error(`[run-company-workflows] SSOT Update node "${ssotNode.node_label}" has invalid SSOT_CHANGE_PLAN structure:`);
          validationErrors.forEach(err => console.error(`  - ${err}`));
          console.error(`[run-company-workflows] The node's prompt must be updated to output the correct JSON schema.`);
          continue;
        }
        
        console.log(`[run-company-workflows] Executing SSOT Change Plan from node "${ssotNode.node_label}": ${changePlan.validated_changes?.length || 0} changes, ${changePlan.new_structure_additions?.length || 0} additions`);
        
        const executeResponse = await fetch(`${supabaseUrl}/functions/v1/execute-ssot-changes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            company_id,
            workflow_id: ssotNode.workflow_id,
            node_id: ssotNode.node_id,
            execution_run_id: submission_id, // Use submission ID as execution context
            plan: changePlan,
            config: ssotNode.config,
          }),
        });
        
        const executeResult = await executeResponse.json();
        console.log(`[run-company-workflows] SSOT Update result for "${ssotNode.node_label}":`, executeResult);
      } catch (ssotError) {
        console.error(`[run-company-workflows] Error processing SSOT Update node "${ssotNode.node_label}":`, ssotError);
        // Don't fail the workflow execution if SSOT update fails
      }
    }
  }

  // Collect all executed node IDs across all workflows for cross-workflow cascade
  const allExecutedNodeIds: Array<{workflowId: string, nodeId: string}> = [];
  for (const wr of workflowResults) {
    if (wr.status === 'completed' && wr.executed) {
      for (const nodeId of wr.executed) {
        allExecutedNodeIds.push({ workflowId: wr.workflow_id, nodeId });
      }
    }
  }

  // Trigger cross-workflow cascade: find OTHER workflows that depend on just-executed nodes
  if (allExecutedNodeIds.length > 0 && !specificWorkflowId) {
    console.log(`[run-company-workflows] Checking for cross-workflow cascades from ${allExecutedNodeIds.length} executed nodes`);
    
    const processedWorkflowIds = new Set(workflowResults.map(wr => wr.workflow_id));
    
    // Fetch all workflows to check for cross-workflow dependencies
    const { data: allWorkflows } = await supabase
      .from('workflows')
      .select('id, name, nodes, settings');
    
    for (const targetWorkflow of allWorkflows || []) {
      // Skip already-processed workflows
      if (processedWorkflowIds.has(targetWorkflow.id)) continue;
      
      // Check if this workflow has company-relevant data attribution
      const settings = targetWorkflow.settings as { data_attribution?: string } | null;
      const attribution = settings?.data_attribution || 'company_data';
      if (attribution !== 'company_data' && attribution !== 'company_related_data') continue;
      
      const targetNodes: Node[] = targetWorkflow.nodes || [];
      
      // Check if any node in this workflow depends on a just-executed node from another workflow
      const hasCrossWorkflowDep = targetNodes.some(node => {
        const promptParts: PromptPart[] = node.config?.promptParts || [];
        return promptParts.some(p => 
          p.type === 'dependency' && 
          p.workflowId && 
          allExecutedNodeIds.some(exec => 
            exec.workflowId === p.workflowId && exec.nodeId === p.value
          )
        );
      });
      
      if (hasCrossWorkflowDep) {
        console.log(`[run-company-workflows] Cross-workflow cascade: triggering workflow "${targetWorkflow.name}" (${targetWorkflow.id})`);
        
        try {
          // Recursively process this dependent workflow
          const cascadeResult = await processCompanyWorkflows(
            supabase, 
            company_id, 
            submission_id, 
            targetWorkflow.id, 
            false, 
            false
          );
          
          // Add to results
          if (cascadeResult.workflows) {
            workflowResults.push(...cascadeResult.workflows);
          }
        } catch (cascadeError: any) {
          console.error(`[run-company-workflows] Cross-workflow cascade error for ${targetWorkflow.name}:`, cascadeError.message);
        }
      }
    }
  }

  // ============= EXECUTION SUMMARY ALERT =============
  // Aggregate stats across all workflows for monitoring
  const executionSummary = {
    totalWorkflows: relevantWorkflows.length,
    executedWorkflows: workflowResults.filter(w => w.status === 'completed').length,
    cachedWorkflows: workflowResults.filter(w => w.status === 'cached').length,
    skippedWorkflows: workflowResults.filter(w => w.status === 'skipped' || !w.status).length,
    totalNodes: 0,
    executedNodes: 0,
    cachedNodes: 0,
    pausedNodes: 0,
    emptyOutputs: 0,
    issues: [] as Array<{ type: string; node_id?: string; node_label?: string; workflow_id?: string; workflow_name?: string; message: string }>,
  };

  // Aggregate node stats
  for (const wr of workflowResults) {
    if (wr.executed) executionSummary.executedNodes += wr.executed.length;
    if (wr.cached) executionSummary.cachedNodes += wr.cached.length;
    executionSummary.totalNodes += (wr.executed?.length || 0) + (wr.cached?.length || 0);
  }

  // Count paused nodes (need to check workflows)
  for (const workflow of relevantWorkflows) {
    const nodes: Node[] = workflow.nodes || [];
    const pausedCount = nodes.filter((n: Node) => n.config?.paused === true).length;
    executionSummary.pausedNodes += pausedCount;
  }

  // Check for empty outputs across all executed nodes
  if (workflowResults.length > 0) {
    const { data: nodeDataRecords } = await supabase
      .from('company_node_data')
      .select('node_id, node_label, workflow_id, data')
      .eq('company_id', company_id)
      .in('workflow_id', workflowResults.map(w => w.workflow_id));

    for (const record of (nodeDataRecords || [])) {
      const output = record.data?.output;
      const isEmpty = output === null || output === undefined || output === '' || 
        (typeof output === 'object' && Object.keys(output).length === 0);
      
      if (isEmpty) {
        executionSummary.emptyOutputs++;
        executionSummary.issues.push({
          type: 'empty_output',
          node_id: record.node_id,
          node_label: record.node_label,
          workflow_id: record.workflow_id,
          message: `Node "${record.node_label || record.node_id}" has empty output`
        });
      }
    }
  }

  // Add workflow-level issues
  for (const wr of workflowResults) {
    if (wr.status === 'cached') {
      executionSummary.issues.push({
        type: 'workflow_cached',
        workflow_id: wr.workflow_id,
        workflow_name: wr.workflow_name,
        message: `Workflow "${wr.workflow_name}" was cached (data unchanged)`
      });
    }
    if (wr.message?.includes('no source node') || wr.message?.includes('No source')) {
      executionSummary.issues.push({
        type: 'no_source',
        workflow_id: wr.workflow_id,
        workflow_name: wr.workflow_name,
        message: `Workflow "${wr.workflow_name}" has no source node`
      });
    }
  }

  // Create execution summary alert (only if there were workflows to process)
  if (executionSummary.totalWorkflows > 0) {
    // Fetch company name for the alert
    const { data: companyData } = await supabase
      .from('companies')
      .select('name')
      .eq('id', company_id)
      .single();
    
    const companyName = companyData?.name || 'Unknown Company';

    try {
      await supabase.rpc('upsert_execution_summary_alert', {
        _company_id: company_id,
        _company_name: companyName,
        _workflow_ids: workflowResults.map(w => w.workflow_id),
        _total_workflows: executionSummary.totalWorkflows,
        _executed_workflows: executionSummary.executedWorkflows,
        _skipped_workflows: executionSummary.skippedWorkflows,
        _total_nodes: executionSummary.totalNodes,
        _executed_nodes: executionSummary.executedNodes,
        _cached_nodes: executionSummary.cachedNodes,
        _paused_nodes: executionSummary.pausedNodes,
        _empty_outputs: executionSummary.emptyOutputs,
        _issues: executionSummary.issues
      });
      console.log(`[run-company-workflows] Created execution summary alert for ${companyName}`);
    } catch (alertErr) {
      console.error('[run-company-workflows] Failed to create execution summary alert:', alertErr);
    }
  }

  return {
    success: true,
    submission_id,
    company_id,
    workflows_processed: workflowResults.length,
    execution_time_ms: executionTime,
    workflows: workflowResults,
    abi_outputs_synced: abiOutputNodes.length,
    abivc_outputs_synced: abivcOutputNodes.length,
    master_data_outputs_synced: masterDataOutputNodes.length,
    ssot_updates_processed: ssotUpdateNodes.length,
    execution_summary: executionSummary,
  };
}

Deno.serve(async (req) => {
  // Health check endpoint for deployment verification
  const url = new URL(req.url);
  if (url.searchParams.get("health") === "true") {
    return new Response(JSON.stringify({
      version: FUNCTION_VERSION,
      timestamp: new Date().toISOString(),
      status: "ok"
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log(`[run-company-workflows] Version ${FUNCTION_VERSION} starting`);

  try {
    // Initialize Supabase client with service role for database operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body = await req.json();
    const { company_id, submission_id, workflow_id: specificWorkflowId, empty_only, all_companies, force, start_from_node_id } = body;

    console.log('[run-company-workflows] Request received:', { company_id, submission_id, specificWorkflowId, empty_only, all_companies, force, start_from_node_id });

    // Handle bulk execution for all companies
    if (all_companies) {
      console.log('[run-company-workflows] Running for all companies, empty_only:', empty_only);
      
      // Fetch all active companies
      const { data: allCompanies, error: companiesError } = await supabase
        .from('companies')
        .select('id, name')
        .eq('status', 'active');

      if (companiesError) throw companiesError;

      const bulkResults = [];
      let totalWorkflowsProcessed = 0;

      for (const company of allCompanies || []) {
        // First, try to find an existing submission with actual data
        const latestRealSubmission = await findLatestDataSubmission(supabase, company.id);
        
        if (!latestRealSubmission) {
          console.log(`[run-company-workflows] No submission with data found for company ${company.id}, skipping`);
          bulkResults.push({ 
            company_id: company.id, 
            company_name: company.name, 
            status: 'skipped', 
            reason: 'no_data_submission' 
          });
          continue;
        }

        // Create a trigger submission that references the run, but processCompanyWorkflows
        // will detect it's a trigger and use the real data
        const { data: newSubmission, error: subError } = await supabase
          .from('company_data_submissions')
          .insert({
            company_id: company.id,
            raw_data: { _trigger: 'bulk_run', timestamp: new Date().toISOString(), empty_only },
            source_type: 'manual',
            status: 'pending',
          })
          .select()
          .single();

        if (subError) {
          console.error(`[run-company-workflows] Error creating submission for company ${company.id}:`, subError);
          bulkResults.push({ company_id: company.id, company_name: company.name, status: 'error', error: subError.message });
          continue;
        }

        // Process workflows for this company - it will automatically use real data
        try {
          const result = await processCompanyWorkflows(supabase, company.id, newSubmission.id, null, empty_only || false);
          bulkResults.push({ 
            company_id: company.id, 
            company_name: company.name, 
            status: 'completed',
            workflows_processed: result.workflows_processed,
          });
          totalWorkflowsProcessed += result.workflows_processed;
        } catch (err: any) {
          console.error(`[run-company-workflows] Error processing company ${company.id}:`, err);
          bulkResults.push({ company_id: company.id, company_name: company.name, status: 'error', error: err.message });
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          all_companies: true,
          companies_processed: bulkResults.length,
          total_workflows_processed: totalWorkflowsProcessed,
          results: bulkResults,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Single company mode
    if (!company_id || !submission_id) {
      console.error('[run-company-workflows] Missing required fields');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: company_id and submission_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await processCompanyWorkflows(supabase, company_id, submission_id, specificWorkflowId, empty_only || false, force || false, start_from_node_id || null);
    
    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Run company workflows error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
