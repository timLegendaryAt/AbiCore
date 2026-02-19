import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, userPrompt } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    let finalPrompt: string;

    if (prompt) {
      finalPrompt = prompt;
    } else if (userPrompt) {
      let systemPromptText: string | null = null;

      try {
        const { data, error } = await supabase
          .from('system_prompts')
          .select('prompt')
          .eq('name', 'Prompt Rewrite')
          .single();

        if (!error && data?.prompt) {
          systemPromptText = data.prompt;
        }
      } catch (e) {
        console.warn('Failed to fetch Prompt Rewrite system prompt:', e);
      }

      if (systemPromptText) {
        finalPrompt = systemPromptText
          .replace(/\{\{USER_PROMPT\}\}/g, userPrompt)
          .replace(/\{\{PROMPT\}\}/g, userPrompt)
          .replace(/\{USER_PROMPT\}/g, userPrompt)
          .replace(/\{PROMPT\}/g, userPrompt);

        if (finalPrompt === systemPromptText) {
          finalPrompt = systemPromptText + "\n\n" + userPrompt;
        }
      } else {
        finalPrompt = `You are a prompt engineering expert. Improve the following prompt to be more clear, specific, and effective while maintaining its original intent:\n\n${userPrompt}`;
      }
    } else {
      throw new Error('Either prompt or userPrompt must be provided');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [
          { role: 'user', content: finalPrompt }
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Payment required, please add credits.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    // Stream the SSE response through to the client while accumulating for usage logging
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let usageData: any = null;

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Forward raw SSE bytes to the client
            controller.enqueue(value);

            // Parse for accumulation
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split('\n')) {
              if (!line.startsWith('data: ')) continue;
              const jsonStr = line.slice(6).trim();
              if (jsonStr === '[DONE]') continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) fullText += content;
                if (parsed.usage) usageData = parsed.usage;
              } catch { /* partial JSON, skip */ }
            }
          }
          controller.close();

          // Fire-and-forget: log usage
          const promptTokens = usageData?.prompt_tokens || 0;
          const completionTokens = usageData?.completion_tokens || 0;
          const totalTokens = usageData?.total_tokens || promptTokens + completionTokens;
          const estimatedCost = ((promptTokens * 0.30) + (completionTokens * 1.20)) / 1_000_000;

          supabase.from('ai_usage_logs').insert({
            model: 'openai/gpt-5-mini',
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
            estimated_cost: estimatedCost,
            usage_category: 'prompt_improvement',
            node_id: 'prompt_builder',
          }).then(() => {});
        } catch (e) {
          console.error('Stream error:', e);
          controller.error(e);
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error in ai-improve-prompt:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
