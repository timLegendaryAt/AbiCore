// Model pricing configuration - derived from unified registry with database overrides
// To update pricing, use the Model Verification Panel to approve changes from research

import { MODEL_REGISTRY, getModelById } from '@/lib/modelRegistry';

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  provider: 'google' | 'openai' | 'perplexity';
  displayName: string;
}

// Base pricing from the static registry (used as fallback)
export const MODEL_PRICING: Record<string, ModelPricing> = Object.fromEntries(
  MODEL_REGISTRY.map(m => [m.id, {
    inputPerMillion: m.inputCostPerMillion,
    outputPerMillion: m.outputCostPerMillion,
    provider: m.provider,
    displayName: m.displayName,
  }])
);

// Calculate cost based on token usage (synchronous - uses cached overrides if available)
export const calculateCost = (
  model: string,
  promptTokens: number,
  completionTokens: number
): number => {
  const pricing = MODEL_PRICING[model];
  
  if (!pricing) {
    // Default pricing for unknown models
    return ((promptTokens * 0.10) + (completionTokens * 0.40)) / 1_000_000;
  }
  
  const inputCost = (promptTokens * pricing.inputPerMillion) / 1_000_000;
  const outputCost = (completionTokens * pricing.outputPerMillion) / 1_000_000;
  
  return inputCost + outputCost;
};

// Calculate cost with database overrides (async - call this for accurate pricing)
export const calculateCostWithOverrides = async (
  model: string,
  promptTokens: number,
  completionTokens: number,
  overrides?: Record<string, { input_cost_per_million: number | null; output_cost_per_million: number | null }>
): Promise<number> => {
  const baseModel = MODEL_REGISTRY.find(m => m.id === model);
  const override = overrides?.[model];
  
  const inputCost = override?.input_cost_per_million ?? baseModel?.inputCostPerMillion ?? 0.10;
  const outputCost = override?.output_cost_per_million ?? baseModel?.outputCostPerMillion ?? 0.40;
  
  return ((promptTokens * inputCost) + (completionTokens * outputCost)) / 1_000_000;
};

// Get model display name
export const getModelDisplayName = (model: string): string => {
  return MODEL_PRICING[model]?.displayName || model;
};

// Get provider color for charts
export const getProviderColor = (model: string): string => {
  const provider = MODEL_PRICING[model]?.provider;
  if (provider === 'google') return 'hsl(217, 91%, 60%)'; // Blue
  if (provider === 'openai') return 'hsl(142, 71%, 45%)'; // Green
  if (provider === 'perplexity') return 'hsl(186, 76%, 46%)'; // Teal
  return 'hsl(var(--muted-foreground))';
};
