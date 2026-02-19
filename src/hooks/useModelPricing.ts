import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MODEL_REGISTRY, ModelInfo } from '@/lib/modelRegistry';

interface ModelPricingOverride {
  model_id: string;
  input_cost_per_million: number | null;
  output_cost_per_million: number | null;
  context_window: number | null;
  max_output_tokens: number | null;
}

interface EffectiveModelInfo extends ModelInfo {
  hasOverride: boolean;
}

// Cache for overrides to avoid repeated DB calls
let cachedOverrides: Record<string, ModelPricingOverride> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60000; // 1 minute cache

export async function loadModelOverrides(): Promise<Record<string, ModelPricingOverride>> {
  const now = Date.now();
  if (cachedOverrides && now - cacheTimestamp < CACHE_TTL) {
    return cachedOverrides;
  }

  const { data, error } = await supabase
    .from('model_pricing_overrides')
    .select('model_id, input_cost_per_million, output_cost_per_million, context_window, max_output_tokens');

  if (error) {
    console.error('Error loading model overrides:', error);
    return {};
  }

  cachedOverrides = (data || []).reduce((acc, override) => {
    acc[override.model_id] = override;
    return acc;
  }, {} as Record<string, ModelPricingOverride>);
  
  cacheTimestamp = now;
  return cachedOverrides;
}

export function invalidateModelOverrideCache() {
  cachedOverrides = null;
  cacheTimestamp = 0;
}

export async function getEffectiveModel(modelId: string): Promise<EffectiveModelInfo | null> {
  const baseModel = MODEL_REGISTRY.find(m => m.id === modelId);
  if (!baseModel) return null;

  const overrides = await loadModelOverrides();
  const override = overrides[modelId];

  if (!override) {
    return { ...baseModel, hasOverride: false };
  }

  return {
    ...baseModel,
    inputCostPerMillion: override.input_cost_per_million ?? baseModel.inputCostPerMillion,
    outputCostPerMillion: override.output_cost_per_million ?? baseModel.outputCostPerMillion,
    contextWindow: override.context_window ?? baseModel.contextWindow,
    maxOutputTokens: override.max_output_tokens ?? baseModel.maxOutputTokens,
    hasOverride: true,
  };
}

export async function getEffectiveModelRegistry(): Promise<EffectiveModelInfo[]> {
  const overrides = await loadModelOverrides();
  
  return MODEL_REGISTRY.map(baseModel => {
    const override = overrides[baseModel.id];
    if (!override) {
      return { ...baseModel, hasOverride: false };
    }
    return {
      ...baseModel,
      inputCostPerMillion: override.input_cost_per_million ?? baseModel.inputCostPerMillion,
      outputCostPerMillion: override.output_cost_per_million ?? baseModel.outputCostPerMillion,
      contextWindow: override.context_window ?? baseModel.contextWindow,
      maxOutputTokens: override.max_output_tokens ?? baseModel.maxOutputTokens,
      hasOverride: true,
    };
  });
}

export function useModelPricing() {
  const [models, setModels] = useState<EffectiveModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const effectiveModels = await getEffectiveModelRegistry();
        setModels(effectiveModels);
      } catch (error) {
        console.error('Error loading model pricing:', error);
        // Fall back to base registry
        setModels(MODEL_REGISTRY.map(m => ({ ...m, hasOverride: false })));
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const refresh = async () => {
    invalidateModelOverrideCache();
    const effectiveModels = await getEffectiveModelRegistry();
    setModels(effectiveModels);
  };

  return { models, isLoading, refresh };
}

// Synchronous function for cost calculation that uses cache
export function calculateEffectiveCost(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): number {
  const baseModel = MODEL_REGISTRY.find(m => m.id === modelId);
  const override = cachedOverrides?.[modelId];
  
  const inputCost = override?.input_cost_per_million ?? baseModel?.inputCostPerMillion ?? 0.10;
  const outputCost = override?.output_cost_per_million ?? baseModel?.outputCostPerMillion ?? 0.40;
  
  return ((promptTokens * inputCost) + (completionTokens * outputCost)) / 1_000_000;
}
