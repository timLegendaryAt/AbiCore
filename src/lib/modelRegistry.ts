// Unified Model Registry - Single source of truth for all AI model information
// Last updated: 2026-01-25

export interface ModelInfo {
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

export const MODEL_REGISTRY: ModelInfo[] = [
  // Google Gemini Models
  {
    id: 'google/gemini-3-flash-preview',
    displayName: 'Gemini 3 Flash (Preview)',
    provider: 'google',
    description: 'Fast next-gen model. Balanced speed and capability.',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 0.40,
    capabilities: {
      webSearch: true,
      multimodal: true,
      reasoning: 'standard',
    },
    recommended: true,
  },
  {
    id: 'google/gemini-3-pro-preview',
    displayName: 'Gemini 3 Pro (Preview)',
    provider: 'google',
    description: 'Next-generation Gemini. Enhanced reasoning capabilities.',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    inputCostPerMillion: 1.25,
    outputCostPerMillion: 10.00,
    capabilities: {
      webSearch: true,
      multimodal: true,
      reasoning: 'advanced',
    },
    recommended: false,
  },
  {
    id: 'google/gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    provider: 'google',
    description: 'Top-tier. Best for image+text, complex reasoning, large contexts.',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    inputCostPerMillion: 1.25,
    outputCostPerMillion: 10.00,
    capabilities: {
      webSearch: true,
      multimodal: true,
      reasoning: 'advanced',
    },
    recommended: false,
  },
  {
    id: 'google/gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    provider: 'google',
    description: 'Balanced cost and latency. Good multimodal and reasoning.',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    inputCostPerMillion: 0.15,
    outputCostPerMillion: 0.60,
    capabilities: {
      webSearch: true,
      multimodal: true,
      reasoning: 'standard',
    },
    recommended: false,
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    displayName: 'Gemini 2.5 Flash Lite',
    provider: 'google',
    description: 'Fastest and cheapest. Best for simple tasks and high volume.',
    contextWindow: 1000000,
    maxOutputTokens: 65536,
    inputCostPerMillion: 0.075,
    outputCostPerMillion: 0.30,
    capabilities: {
      webSearch: true,
      multimodal: true,
      reasoning: 'basic',
    },
    recommended: false,
  },
  // OpenAI Models
  {
    id: 'openai/gpt-5.2',
    displayName: 'GPT-5.2',
    provider: 'openai',
    description: 'Latest OpenAI. Enhanced reasoning for complex problems.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPerMillion: 2.50,
    outputCostPerMillion: 10.00,
    capabilities: {
      webSearch: false,
      multimodal: true,
      reasoning: 'advanced',
    },
    recommended: false,
  },
  {
    id: 'openai/gpt-5',
    displayName: 'GPT-5',
    provider: 'openai',
    description: 'Powerful all-rounder. Excellent reasoning and multimodal.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPerMillion: 2.50,
    outputCostPerMillion: 10.00,
    capabilities: {
      webSearch: false,
      multimodal: true,
      reasoning: 'advanced',
    },
    recommended: false,
  },
  {
    id: 'openai/gpt-5-mini',
    displayName: 'GPT-5 Mini',
    provider: 'openai',
    description: 'Lower cost, keeps most capabilities. Good balance.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPerMillion: 0.30,
    outputCostPerMillion: 1.20,
    capabilities: {
      webSearch: false,
      multimodal: true,
      reasoning: 'standard',
    },
    recommended: false,
  },
  {
    id: 'openai/gpt-5-nano',
    displayName: 'GPT-5 Nano',
    provider: 'openai',
    description: 'Speed and cost optimized. Best for high-volume simple tasks.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPerMillion: 0.10,
    outputCostPerMillion: 0.40,
    capabilities: {
      webSearch: false,
      multimodal: true,
      reasoning: 'basic',
    },
    recommended: false,
  },
  // Perplexity Sonar Models
  {
    id: 'perplexity/sonar',
    displayName: 'Sonar',
    provider: 'perplexity',
    description: 'Fast, cost-efficient. Best for Q&A and real-time news.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPerMillion: 1.00,
    outputCostPerMillion: 1.00,
    capabilities: {
      webSearch: true,
      multimodal: false,
      reasoning: 'standard',
    },
    recommended: false,
  },
  {
    id: 'perplexity/sonar-pro',
    displayName: 'Sonar Pro',
    provider: 'perplexity',
    description: 'Detailed research with deeper content understanding.',
    contextWindow: 200000,
    maxOutputTokens: 16384,
    inputCostPerMillion: 3.00,
    outputCostPerMillion: 15.00,
    capabilities: {
      webSearch: true,
      multimodal: false,
      reasoning: 'advanced',
    },
    recommended: false,
  },
  {
    id: 'perplexity/sonar-reasoning-pro',
    displayName: 'Sonar Reasoning Pro',
    provider: 'perplexity',
    description: 'Multi-step logic and chain-of-thought reasoning.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPerMillion: 2.00,
    outputCostPerMillion: 8.00,
    capabilities: {
      webSearch: true,
      multimodal: false,
      reasoning: 'advanced',
    },
    recommended: false,
  },
  {
    id: 'perplexity/sonar-deep-research',
    displayName: 'Sonar Deep Research',
    provider: 'perplexity',
    description: 'Exhaustive synthesis across hundreds of sources.',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPerMillion: 2.00,
    outputCostPerMillion: 8.00,
    capabilities: {
      webSearch: true,
      multimodal: false,
      reasoning: 'advanced',
    },
    recommended: false,
  },
];

export const LAST_UPDATED = '2026-01-25';

// Helper functions
export const getModelById = (id: string): ModelInfo | undefined => {
  return MODEL_REGISTRY.find(m => m.id === id);
};

export const getModelsByProvider = (provider: 'google' | 'openai' | 'perplexity'): ModelInfo[] => {
  return MODEL_REGISTRY.filter(m => m.provider === provider);
};

export const formatTokenCount = (tokens: number): string => {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(0)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }
  return tokens.toString();
};

export const formatCost = (cost: number): string => {
  if (cost < 0.10) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
};
