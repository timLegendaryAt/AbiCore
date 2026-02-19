const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ModelInfo {
  id: string;
  displayName: string;
  provider: 'google' | 'openai' | 'perplexity';
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  capabilities: {
    webSearch: boolean;
    multimodal: boolean;
    reasoning: 'basic' | 'standard' | 'advanced';
  };
  recommended: boolean;
}

interface VerificationResult {
  matches: string[];
  discrepancies: Array<{
    modelId: string;
    modelName: string;
    field: string;
    oldValue: string | number;
    newValue: string | number;
    source?: string;
  }>;
  newModels: Array<{
    id: string;
    displayName: string;
    provider: string;
    inputCostPerMillion?: number;
    outputCostPerMillion?: number;
    contextWindow?: number;
    maxOutputTokens?: number;
    source?: string;
  }>;
  deprecatedModels: string[];
  errors: string[];
  citations: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { models } = await req.json() as { models: ModelInfo[] };

    if (!models || !Array.isArray(models)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Models array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('PERPLEXITY_API_KEY');
    if (!apiKey) {
      console.error('PERPLEXITY_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Perplexity API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result: VerificationResult = {
      matches: [],
      discrepancies: [],
      newModels: [],
      deprecatedModels: [],
      errors: [],
      citations: [],
    };

    // Group models by provider
    const modelsByProvider = models.reduce((acc, model) => {
      if (!acc[model.provider]) acc[model.provider] = [];
      acc[model.provider].push(model);
      return acc;
    }, {} as Record<string, ModelInfo[]>);

    // Query each provider
    for (const [provider, providerModels] of Object.entries(modelsByProvider)) {
      try {
        console.log(`[verify-model-data] Querying ${provider} models...`);
        
        const modelList = providerModels.map(m => `- ${m.id}: ${m.displayName}`).join('\n');
        
        const prompt = `Research the current official pricing and specifications for ${provider === 'google' ? 'Google Gemini' : provider === 'openai' ? 'OpenAI GPT' : 'Perplexity Sonar'} AI models as of today.

For each model found, provide:
1. Model ID (exact API identifier)
2. Display name
3. Input cost per million tokens (USD)
4. Output cost per million tokens (USD)
5. Context window size (tokens)
6. Max output tokens

Current models in our registry to verify:
${modelList}

Important: Only include models that are currently available for API access. Flag any models in our list that may be deprecated or renamed.`;

        const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'sonar-pro',
            messages: [
              {
                role: 'system',
                content: `You are a technical researcher specializing in AI model pricing and specifications. Return accurate, up-to-date information from official sources. Format your response as JSON with this structure:
{
  "models": [
    {
      "model_id": "string",
      "display_name": "string",
      "input_cost_per_million": number,
      "output_cost_per_million": number,
      "context_window": number,
      "max_output_tokens": number,
      "status": "available" | "deprecated" | "preview"
    }
  ],
  "notes": "any important observations"
}`
              },
              { role: 'user', content: prompt }
            ],
            temperature: 0.1,
          }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          console.error(`[verify-model-data] Perplexity error for ${provider}:`, errorData);
          result.errors.push(`Failed to verify ${provider} models: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        
        // Log verification usage
        const usage = data.usage;
        if (usage) {
          try {
            const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.58.0');
            const supabase = createClient(
              Deno.env.get('SUPABASE_URL')!,
              Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            );
            
            const promptTokens = usage.prompt_tokens || 0;
            const completionTokens = usage.completion_tokens || 0;
            const totalTokens = usage.total_tokens || promptTokens + completionTokens;
            // Default pricing for perplexity/sonar-pro
            const cost = ((promptTokens * 3.00) + (completionTokens * 15.00)) / 1_000_000;
            
            await supabase.from('ai_usage_logs').insert({
              node_id: 'model_verification',
              model: 'perplexity/sonar-pro',
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: totalTokens,
              estimated_cost: cost,
              usage_category: 'verification',
            });
          } catch (logError) {
            console.error('[verify-model-data] Failed to log usage:', logError);
          }
        }
        
        // Collect citations
        if (data.citations && Array.isArray(data.citations)) {
          result.citations.push(...data.citations);
        }

        // Parse JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.error(`[verify-model-data] Could not parse JSON from ${provider} response`);
          result.errors.push(`Could not parse response for ${provider}`);
          continue;
        }

        let parsedData;
        try {
          parsedData = JSON.parse(jsonMatch[0]);
        } catch (e) {
          console.error(`[verify-model-data] JSON parse error for ${provider}:`, e);
          result.errors.push(`Invalid JSON in ${provider} response`);
          continue;
        }

        const researchedModels = parsedData.models || [];
        const researchedIds = new Set(researchedModels.map((m: any) => m.model_id?.toLowerCase()));

        // Compare each model in our registry
        for (const model of providerModels) {
          const researched = researchedModels.find((m: any) => 
            m.model_id?.toLowerCase() === model.id.toLowerCase() ||
            m.display_name?.toLowerCase() === model.displayName.toLowerCase()
          );

          if (!researched) {
            // Model not found in research - might be deprecated
            result.deprecatedModels.push(model.id);
            continue;
          }

          if (researched.status === 'deprecated') {
            result.deprecatedModels.push(model.id);
            continue;
          }

          // Check for discrepancies
          let hasDiscrepancy = false;

          const checkField = (field: string, oldVal: number, newVal: number | undefined, threshold = 0.01) => {
            if (newVal !== undefined && Math.abs(oldVal - newVal) > threshold) {
              result.discrepancies.push({
                modelId: model.id,
                modelName: model.displayName,
                field,
                oldValue: oldVal,
                newValue: newVal,
              });
              hasDiscrepancy = true;
            }
          };

          checkField('inputCostPerMillion', model.inputCostPerMillion, researched.input_cost_per_million);
          checkField('outputCostPerMillion', model.outputCostPerMillion, researched.output_cost_per_million);
          checkField('contextWindow', model.contextWindow, researched.context_window, 1000);
          checkField('maxOutputTokens', model.maxOutputTokens, researched.max_output_tokens, 100);

          if (!hasDiscrepancy) {
            result.matches.push(model.id);
          }
        }

        // Check for new models not in our registry
        for (const researched of researchedModels) {
          if (researched.status === 'deprecated') continue;
          
          const existsInRegistry = providerModels.some(m => 
            m.id.toLowerCase() === researched.model_id?.toLowerCase() ||
            m.displayName.toLowerCase() === researched.display_name?.toLowerCase()
          );

          if (!existsInRegistry && researched.model_id) {
            result.newModels.push({
              id: researched.model_id,
              displayName: researched.display_name || researched.model_id,
              provider,
              inputCostPerMillion: researched.input_cost_per_million,
              outputCostPerMillion: researched.output_cost_per_million,
              contextWindow: researched.context_window,
              maxOutputTokens: researched.max_output_tokens,
            });
          }
        }

        // Add small delay between providers to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (providerError) {
        console.error(`[verify-model-data] Error processing ${provider}:`, providerError);
        result.errors.push(`Error verifying ${provider}: ${providerError instanceof Error ? providerError.message : 'Unknown error'}`);
      }
    }

    console.log(`[verify-model-data] Verification complete:`, {
      matches: result.matches.length,
      discrepancies: result.discrepancies.length,
      newModels: result.newModels.length,
      deprecatedModels: result.deprecatedModels.length,
      errors: result.errors.length,
    });

    // Save verification results and create system alert
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.58.0');
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const hasPendingChanges = result.discrepancies.length > 0 || 
                                result.newModels.length > 0 || 
                                result.deprecatedModels.length > 0;

      // Store full verification results in app_settings for later retrieval
      const { data: existingSettings } = await supabase
        .from('app_settings')
        .select('model_verification_settings')
        .limit(1)
        .maybeSingle();

      const currentSettings = existingSettings?.model_verification_settings || {};
      
      await supabase
        .from('app_settings')
        .update({
          model_verification_settings: {
            ...currentSettings,
            last_run: new Date().toISOString(),
            last_result: {
              matches_count: result.matches.length,
              discrepancies_count: result.discrepancies.length,
              new_models_count: result.newModels.length,
              deprecated_count: result.deprecatedModels.length,
            },
            // Store full pending changes for approval workflow
            pending_changes: hasPendingChanges ? {
              discrepancies: result.discrepancies,
              newModels: result.newModels,
              deprecatedModels: result.deprecatedModels,
              citations: result.citations,
            } : null,
          },
        })
        .not('id', 'is', null);

      // Create system alert
      await supabase.rpc('upsert_verification_alert', {
        _matches_count: result.matches.length,
        _discrepancies_count: result.discrepancies.length,
        _new_models_count: result.newModels.length,
        _deprecated_count: result.deprecatedModels.length,
        _has_pending_changes: hasPendingChanges,
      });

      console.log('[verify-model-data] Saved results and created verification alert');
    } catch (alertError) {
      console.error('[verify-model-data] Failed to save results/create alert:', alertError);
      // Don't fail the request if this fails
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[verify-model-data] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
