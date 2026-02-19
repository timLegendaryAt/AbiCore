import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EvaluationRecord {
  hallucination_score: number | null;
  hallucination_reasoning: string | null;
  data_quality_score: number | null;
  data_quality_reasoning: string | null;
  complexity_score: number | null;
  complexity_reasoning: string | null;
  evaluated_at: string;
  node_label: string | null;
  node_id: string;
  workflow_id: string;
  company_id: string;
}

interface MetricSummary {
  summary: string;
  generated_at: string;
  model: string;
  avg_score: number;
  trend: 'improving' | 'stable' | 'declining';
  evaluation_count: number;
}

interface NodeSummaries {
  [nodeKey: string]: {
    node_label: string;
    hallucination: MetricSummary;
    data_quality: MetricSummary;
    complexity: MetricSummary;
    last_updated: string;
  }
}

async function generateSummaryForMetric(
  metricName: string,
  scores: { score: number; reasoning: string | null; timestamp: string }[],
  apiKey: string,
  nodeLabel: string | null,
  supabase: any,
  workflowId?: string,
  nodeId?: string
): Promise<MetricSummary> {
  const validScores = scores.filter(s => s.score !== null);
  
  if (validScores.length === 0) {
    return {
      summary: "No evaluation data available for this metric yet.",
      generated_at: new Date().toISOString(),
      model: "none",
      avg_score: 0,
      trend: 'stable',
      evaluation_count: 0
    };
  }
  
  // Calculate average and trend
  const avgScore = Math.round(validScores.reduce((a, b) => a + b.score, 0) / validScores.length);
  
  // Determine trend by comparing first half to second half
  const midpoint = Math.floor(validScores.length / 2);
  const recentHalf = validScores.slice(0, midpoint);
  const olderHalf = validScores.slice(midpoint);
  
  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentHalf.length > 0 && olderHalf.length > 0) {
    const recentAvg = recentHalf.reduce((a, b) => a + b.score, 0) / recentHalf.length;
    const olderAvg = olderHalf.reduce((a, b) => a + b.score, 0) / olderHalf.length;
    const diff = recentAvg - olderAvg;
    if (diff > 5) trend = 'improving';
    else if (diff < -5) trend = 'declining';
  }
  
  // Build context for AI
  const scoreList = validScores.slice(0, 10).map(s => 
    `${s.score}% (${new Date(s.timestamp).toLocaleDateString()})`
  ).join(', ');
  
  const reasoningSample = validScores
    .filter(s => s.reasoning)
    .slice(0, 5)
    .map(s => s.reasoning)
    .join('\n- ');
  
  const metricDescription = {
    hallucination: "how well the AI output is grounded in provided data (100% = fully grounded, 0% = fabricated)",
    data_quality: "whether input data is sufficient for quality output (100% = all data present, 0% = critical data missing)",
    complexity: "whether prompts are appropriately scoped (100% = simple & manageable, 0% = too complex)"
  }[metricName] || "quality metric";

  const nodeName = nodeLabel || 'Unknown Node';
  const prompt = `You are analyzing the last ${validScores.length} AI generation evaluations for the "${nodeName}" node, specifically for ${metricName.replace('_', ' ')}.

Metric: ${metricDescription}
Average Score: ${avgScore}%
Trend: ${trend}
Recent scores: ${scoreList}

${reasoningSample ? `Sample reasoning from evaluations:\n- ${reasoningSample}` : ''}

Provide a 2-3 sentence summary that:
1. States the current status for this node (e.g., "The ${nodeName} node scores are ${trend === 'improving' ? 'improving' : trend === 'declining' ? 'declining' : 'stable'} at ~${avgScore}%")
2. Identifies the most common issue if scores are below 80%
3. Suggests one specific, actionable improvement for this node

Keep it concise and actionable. Focus on patterns, not individual evaluations.`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "You are a concise quality analyst. Provide brief, actionable summaries." },
          { role: "user", content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error(`AI API error: ${response.status}`);
      return {
        summary: `Average score: ${avgScore}%. Trend: ${trend}. ${validScores.length} evaluations analyzed.`,
        generated_at: new Date().toISOString(),
        model: "fallback",
        avg_score: avgScore,
        trend,
        evaluation_count: validScores.length
      };
    }

    const result = await response.json();
    const summary = result.choices?.[0]?.message?.content?.trim() || 
      `Average score: ${avgScore}%. Trend: ${trend}.`;

    // Log summary generation usage
    const usage = result.usage;
    if (usage && supabase) {
      const promptTokens = usage.prompt_tokens || 0;
      const completionTokens = usage.completion_tokens || 0;
      const totalTokens = usage.total_tokens || promptTokens + completionTokens;
      // Default pricing for gemini-2.5-flash-lite
      const cost = ((promptTokens * 0.075) + (completionTokens * 0.30)) / 1_000_000;
      
      await supabase.from('ai_usage_logs').insert({
        workflow_id: workflowId || null,
        node_id: nodeId || 'improvement_summary',
        model: 'google/gemini-2.5-flash-lite',
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        estimated_cost: cost,
        usage_category: 'summary',
      });
    }

    return {
      summary,
      generated_at: new Date().toISOString(),
      model: "google/gemini-2.5-flash-lite",
      avg_score: avgScore,
      trend,
      evaluation_count: validScores.length
    };
  } catch (error) {
    console.error("Error generating summary:", error);
    return {
      summary: `Average score: ${avgScore}%. Trend: ${trend}. ${validScores.length} evaluations analyzed.`,
      generated_at: new Date().toISOString(),
      model: "fallback",
      avg_score: avgScore,
      trend,
      evaluation_count: validScores.length
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get settings from self_improvement_settings column
    const { data: settings } = await supabase
      .from('app_settings')
      .select('id, self_improvement_settings')
      .limit(1)
      .maybeSingle();
    
    const selfImprovementSettings = settings?.self_improvement_settings || {
      evaluation_limit: 20,
      summary_days: 7
    };
    
    const evaluationLimit = selfImprovementSettings.evaluation_limit || 20;
    const summaryDays = selfImprovementSettings.summary_days || 7;
    
    // Calculate date cutoff
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - summaryDays);
    
    // Fetch recent evaluations within date range
    const { data: evaluations, error } = await supabase
      .from('evaluation_history')
      .select('hallucination_score, hallucination_reasoning, data_quality_score, data_quality_reasoning, complexity_score, complexity_reasoning, evaluated_at, node_label, node_id, workflow_id, company_id')
      .gte('evaluated_at', cutoffDate.toISOString())
      .order('evaluated_at', { ascending: false })
      .limit(evaluationLimit * 10); // Fetch more to allow for per-node grouping
    
    if (error) {
      throw new Error(`Failed to fetch evaluations: ${error.message}`);
    }
    
    if (!evaluations || evaluations.length === 0) {
      // Create alert for no data case
      await supabase.rpc('upsert_summary_alert', {
        _nodes_processed: 0,
        _evaluations_analyzed: 0,
        _status: 'no_data'
      });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "No evaluations to analyze",
          summaries: {} 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Group evaluations by workflow_id:node_id
    const nodeGroups = new Map<string, EvaluationRecord[]>();
    for (const evalRecord of evaluations) {
      const key = `${evalRecord.workflow_id}:${evalRecord.node_id}`;
      if (!nodeGroups.has(key)) {
        nodeGroups.set(key, []);
      }
      const nodeEvals = nodeGroups.get(key)!;
      // Limit per node to evaluation_limit
      if (nodeEvals.length < evaluationLimit) {
        nodeGroups.get(key)!.push(evalRecord);
      }
    }
    
    console.log(`[generate-improvement-summary] Processing ${nodeGroups.size} unique nodes from ${evaluations.length} evaluations`);
    
    // Generate summaries for each node
    const nodeSummaries: NodeSummaries = {};
    
    for (const [nodeKey, nodeEvals] of nodeGroups) {
      const firstEval = nodeEvals[0];
      const nodeLabel = firstEval.node_label || nodeKey;
      
      console.log(`[generate-improvement-summary] Generating summaries for node "${nodeLabel}" (${nodeEvals.length} evaluations)`);
      
      // Prepare data for each metric
      const hallucinationData = nodeEvals.map(e => ({
        score: e.hallucination_score!,
        reasoning: e.hallucination_reasoning,
        timestamp: e.evaluated_at
      })).filter(e => e.score !== null);
      
      const dataQualityData = nodeEvals.map(e => ({
        score: e.data_quality_score!,
        reasoning: e.data_quality_reasoning,
        timestamp: e.evaluated_at
      })).filter(e => e.score !== null);
      
      const complexityData = nodeEvals.map(e => ({
        score: e.complexity_score!,
        reasoning: e.complexity_reasoning,
        timestamp: e.evaluated_at
      })).filter(e => e.score !== null);
      
      // Extract workflowId and nodeId from key
      const [wfId, ndId] = nodeKey.split(':');
      
      // Generate summaries in parallel for this node with usage tracking
      const [hallucinationSummary, dataQualitySummary, complexitySummary] = await Promise.all([
        generateSummaryForMetric('hallucination', hallucinationData, lovableApiKey, nodeLabel, supabase, wfId, ndId),
        generateSummaryForMetric('data_quality', dataQualityData, lovableApiKey, nodeLabel, supabase, wfId, ndId),
        generateSummaryForMetric('complexity', complexityData, lovableApiKey, nodeLabel, supabase, wfId, ndId)
      ]);
      
      nodeSummaries[nodeKey] = {
        node_label: nodeLabel,
        hallucination: hallucinationSummary,
        data_quality: dataQualitySummary,
        complexity: complexitySummary,
        last_updated: new Date().toISOString()
      };
    }
    
    // Update app_settings with new per-node summaries
    const { error: updateError } = await supabase
      .from('app_settings')
      .update({ 
        improvement_summaries: nodeSummaries,
        summary_schedule: {
          last_run: new Date().toISOString(),
          nodes_processed: nodeGroups.size
        }
      })
      .eq('id', settings?.id || (await supabase.from('app_settings').select('id').limit(1).single()).data?.id);
    
    if (updateError) {
      console.error("Failed to save summaries:", updateError);
    }
    
    // Run cleanup to remove old evaluations beyond limit
    await supabase.rpc('cleanup_evaluation_history', { _keep_limit: evaluationLimit });
    
    // Create system alert for successful summary generation
    await supabase.rpc('upsert_summary_alert', {
      _nodes_processed: nodeGroups.size,
      _evaluations_analyzed: evaluations.length,
      _status: 'success'
    });
    
    console.log(`[generate-improvement-summary] Created alert for ${nodeGroups.size} nodes processed`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        summaries: nodeSummaries,
        nodes_processed: nodeGroups.size,
        evaluations_analyzed: evaluations.length 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
