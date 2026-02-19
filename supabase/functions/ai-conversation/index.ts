import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Calculate cost based on model and token usage
function calculateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'google/gemini-3-flash-preview': { input: 0.10, output: 0.40 },
    'google/gemini-3-pro-preview': { input: 1.25, output: 10.00 },
    'google/gemini-2.5-pro': { input: 1.25, output: 10.00 },
    'google/gemini-2.5-flash': { input: 0.15, output: 0.60 },
    'google/gemini-2.5-flash-lite': { input: 0.075, output: 0.30 },
    'openai/gpt-5.2': { input: 2.50, output: 10.00 },
    'openai/gpt-5': { input: 2.50, output: 10.00 },
    'openai/gpt-5-mini': { input: 0.30, output: 1.20 },
    'openai/gpt-5-nano': { input: 0.10, output: 0.40 },
  };
  const p = pricing[model] || { input: 0.10, output: 0.40 };
  return ((promptTokens * p.input) + (completionTokens * p.output)) / 1_000_000;
}

async function executeToolCall(toolName: string, toolArgs: any) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  
  const response = await fetch(`${supabaseUrl}/functions/v1/execute-ai-tool`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      toolName,
      arguments: toolArgs
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tool execution failed: ${error}`);
  }

  return await response.json();
}

async function streamWithToolCalls(
  messages: any[],
  tools: any[],
  model: string,
  lovableApiKey: string,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder,
  preventWorkflowTools: boolean = false,
  accumulatedContent: { text: string } = { text: '' }
): Promise<void> {
  // Filter out workflow construction tools if we just executed them
  const filteredTools = preventWorkflowTools 
    ? tools.filter(t => !['create_workflow_node', 'connect_workflow_nodes'].includes(t.function.name))
    : tools;

  const requestBody: any = {
    model,
    messages,
    stream: true
  };

  if (filteredTools.length > 0) {
    requestBody.tools = filteredTools;
  }

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('RATE_LIMIT');
    }
    if (response.status === 402) {
      throw new Error('PAYMENT_REQUIRED');
    }
    const errorText = await response.text();
    console.error('AI Gateway error:', response.status, errorText);
    throw new Error(`AI Gateway error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let toolCalls: any[] = [];
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim() || line.startsWith(':')) continue;
      if (!line.startsWith('data: ')) continue;

      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta;
        
        if (delta?.content) {
          accumulatedContent.text += delta.content;
          await writer.write(encoder.encode(`data: ${JSON.stringify({ content: delta.content })}\n\n`));
        }

        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (!toolCalls[toolCall.index]) {
              toolCalls[toolCall.index] = {
                id: toolCall.id,
                type: 'function',
                function: { name: '', arguments: '' }
              };
            }
            if (toolCall.function?.name) {
              toolCalls[toolCall.index].function.name = toolCall.function.name;
            }
            if (toolCall.function?.arguments) {
              toolCalls[toolCall.index].function.arguments += toolCall.function.arguments;
            }
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  // Execute any tool calls
  if (toolCalls.length > 0) {
    const toolResults = [];
    let hasWorkflowTools = false;
    
    for (const toolCall of toolCalls) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        
        // Track if we executed workflow construction tools
        if (['create_workflow_node', 'connect_workflow_nodes'].includes(toolCall.function.name)) {
          hasWorkflowTools = true;
        }
        
        // Send tool execution notification
        await writer.write(encoder.encode(`data: ${JSON.stringify({ 
          tool_call: { name: toolCall.function.name, arguments: args } 
        })}\n\n`));
        
        const result = await executeToolCall(toolCall.function.name, args);
        
        // Send tool result
        await writer.write(encoder.encode(`data: ${JSON.stringify({ 
          tool_result: { name: toolCall.function.name, result } 
        })}\n\n`));
        
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      } catch (error) {
        console.error('Tool execution error:', error);
        await writer.write(encoder.encode(`data: ${JSON.stringify({ 
          tool_error: { name: toolCall.function.name, error: error instanceof Error ? error.message : 'Unknown error' } 
        })}\n\n`));
        
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })
        });
      }
    }

    // Make another call with tool results
    const newMessages = [
      ...messages,
      { role: 'assistant', tool_calls: toolCalls },
      ...toolResults
    ];

    // Prevent workflow tools on recursive call if we just executed them
    await streamWithToolCalls(newMessages, tools, model, lovableApiKey, writer, encoder, hasWorkflowTools, accumulatedContent);
  }
}

async function fetchAvailableDependencies(supabase: any) {
  // Fetch datasets
  const { data: datasets } = await supabase
    .from('datasets')
    .select('id, name, description, category')
    .order('name');
  
  // Fetch frameworks
  const { data: frameworks } = await supabase
    .from('frameworks')
    .select('id, name, description, type, category')
    .order('name');
  
  // Fetch root-level workflows
  const { data: workflows } = await supabase
    .from('workflows')
    .select('id, name, description')
    .is('parent_id', null)
    .order('name');
  
  // Fetch connected integrations
  const { data: integrations } = await supabase
    .from('integrations')
    .select('id, name, description, category')
    .eq('connected', true)
    .order('name');
  
  return {
    datasets: datasets || [],
    frameworks: frameworks || [],
    workflows: workflows || [],
    integrations: integrations || []
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, workflowContext, conversationHistory, agentType, workflowPlan } = await req.json();
    
    // Default to 'user' agent for planning, or use specified type
    const requestedAgentType = agentType || 'user';
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch the appropriate AI agent configuration
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('*, ai_agent_tools(tool_id, ai_tools(*))')
      .eq('type', requestedAgentType)
      .eq('enabled', true)
      .single();

    if (agentError || !agent) {
      console.error('Error fetching agent:', agentError);
      return new Response(
        JSON.stringify({ error: `${requestedAgentType} agent not configured` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Using agent configuration:', {
      name: agent.name,
      type: requestedAgentType,
      model: agent.model,
      toolsCount: agent.ai_agent_tools?.length || 0,
    });

    // Build system prompt with workflow context
    let systemPrompt = agent.system_prompt;

    // Fetch available dependencies
    const dependencies = await fetchAvailableDependencies(supabase);
    
    // If system agent, include the workflow plan
    if (requestedAgentType === 'system' && workflowPlan) {
      systemPrompt += `\n\nAPPROVED WORKFLOW PLAN:\n${workflowPlan}\n\nExecute this plan by creating the specified nodes and connections.`;
    }
    
    // Add workflow context for all agents
    systemPrompt += `

CURRENT WORKFLOW CONTEXT:
- Workflow ID: ${workflowContext.id || 'unknown'}
- Total nodes: ${workflowContext.nodes?.length || 0}
- Total edges: ${workflowContext.edgesCount || 0}
- Selected nodes: ${workflowContext.selectedNodes?.length > 0 ? workflowContext.selectedNodes.join(', ') : 'none'}
- Validation errors: ${workflowContext.validationErrors?.length > 0 ? workflowContext.validationErrors.join('; ') : 'none'}

Nodes in current workflow:
${workflowContext.nodes?.map((n: any) => `- ${n.label} (${n.type})`).join('\n') || 'No nodes yet'}

AVAILABLE DEPENDENCIES YOU CAN REFERENCE:

**Datasets** (${dependencies.datasets.length} available):
${dependencies.datasets.length > 0 
  ? dependencies.datasets.map((d: any) => 
      `- "${d.name}" (${d.category})${d.description ? ': ' + d.description : ''}`
    ).join('\n')
  : '- No datasets created yet'}

**Frameworks** (${dependencies.frameworks.length} available):
${dependencies.frameworks.length > 0
  ? dependencies.frameworks.map((f: any) => 
      `- "${f.name}" (${f.type}, ${f.category})${f.description ? ': ' + f.description : ''}`
    ).join('\n')
  : '- No frameworks created yet'}

**Workflows** (${dependencies.workflows.filter((w: any) => w.id !== workflowContext.id).length} available):
${dependencies.workflows.filter((w: any) => w.id !== workflowContext.id).length > 0
  ? dependencies.workflows
      .filter((w: any) => w.id !== workflowContext.id)
      .map((w: any) => 
        `- "${w.name}"${w.description ? ': ' + w.description : ''}`
      ).join('\n')
  : '- No other workflows available'}

**Integrations** (${dependencies.integrations.length} connected):
${dependencies.integrations.length > 0
  ? dependencies.integrations.map((i: any) => 
      `- "${i.name}" (${i.category})${i.description ? ': ' + i.description : ''}`
    ).join('\n')
  : '- No integrations connected yet'}

IMPORTANT FOR PLANNING:
- When users need data sources, suggest using existing datasets instead of creating new ones
- When evaluation/scoring is needed, reference existing frameworks
- When building complex flows, consider referencing other workflows
- Always check if a dependency exists before asking users to create it from scratch

IMPORTANT FOR CREATING NODES WITH DEPENDENCIES:

**When creating Dataset nodes:**
- Use create_workflow_node with config: { datasetId: "<id>", sourceType: "dataset" }
- The datasetId MUST be one of the available dataset IDs listed above
- Example: { workflowId: "...", type: "dataset", label: "Customer Feedback", config: { datasetId: "abc-123" } }
- The tool will validate the ID and automatically enrich the config with dataset name and details

**When creating Framework nodes:**
- Use create_workflow_node with config: { frameworkId: "<id>" }
- The frameworkId MUST be one of the available framework IDs listed above
- Example: { workflowId: "...", type: "framework", label: "Quality Rubric", config: { frameworkId: "xyz-789" } }
- The tool will validate the ID and automatically enrich the config with framework schema and details

**When creating Workflow nodes:**
- Use create_workflow_node with config: { workflowId: "<id>" }
- The workflowId MUST be one of the available workflow IDs listed above (excluding current workflow)
- Example: { workflowId: "...", type: "workflow", label: "Data Processing", config: { workflowId: "def-456" } }
- The tool will validate the ID and automatically enrich the config with workflow name

**Validation:**
- If you provide an invalid ID, the tool will return an error with the exact ID that failed
- Always use the exact IDs from the AVAILABLE DEPENDENCIES section above
- Do not make up or guess IDs - they must match existing resources
`;

    // Prepare messages array
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    // Prepare tools if agent has any enabled tools
    const tools = agent.ai_agent_tools
      ?.filter((at: any) => at.ai_tools?.enabled)
      .map((at: any) => ({
        type: 'function',
        function: {
          name: at.ai_tools.name,
          description: at.ai_tools.description,
          parameters: at.ai_tools.parameters
        }
      })) || [];

    console.log('Calling Lovable AI Gateway:', {
      agentType: requestedAgentType,
      model: agent.model,
      nodesCount: workflowContext.nodes?.length || 0,
      toolsCount: tools.length,
    });

    // Create streaming response
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Track accumulated content for usage estimation
    const accumulatedContent = { text: '' };
    const promptContent = JSON.stringify(messages);

    // Stream response in background
    (async () => {
      try {
        await streamWithToolCalls(messages, tools, agent.model, LOVABLE_API_KEY, writer, encoder, false, accumulatedContent);
        
        // Log estimated usage after streaming completes
        const estimatedPromptTokens = Math.ceil(promptContent.length / 4);
        const estimatedCompletionTokens = Math.ceil(accumulatedContent.text.length / 4);
        const estimatedCost = calculateCost(agent.model, estimatedPromptTokens, estimatedCompletionTokens);
        
        console.log(`[ai-conversation] Estimated usage: ${estimatedPromptTokens} prompt + ${estimatedCompletionTokens} completion tokens, $${estimatedCost.toFixed(6)}`);
        
        // Log to ai_usage_logs
        await supabase.from('ai_usage_logs').insert({
          workflow_id: workflowContext?.id || null,
          company_id: null,
          node_id: 'ai-conversation',
          model: agent.model,
          prompt_tokens: estimatedPromptTokens,
          completion_tokens: estimatedCompletionTokens,
          total_tokens: estimatedPromptTokens + estimatedCompletionTokens,
          estimated_cost: estimatedCost,
        });
        
        await writer.write(encoder.encode('data: [DONE]\n\n'));
        await writer.close();
      } catch (error) {
        console.error('Streaming error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (errorMessage === 'RATE_LIMIT') {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ 
            error: 'Rate limit exceeded. Please try again later.' 
          })}\n\n`));
        } else if (errorMessage === 'PAYMENT_REQUIRED') {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ 
            error: 'Payment required. Please add credits to your Lovable AI workspace.' 
          })}\n\n`));
        } else {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ 
            error: errorMessage 
          })}\n\n`));
        }
        
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Error in ai-conversation function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
