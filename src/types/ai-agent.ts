export interface AIAgent {
  id: string;
  name: string;
  type: 'user' | 'system';
  description?: string | null;
  system_prompt: string;
  model: string;
  temperature: number;
  max_tokens: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  ai_agent_tools?: {
    tool_id: string;
    ai_tools?: AITool;
  }[];
}

export interface AITool {
  id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIAgentTool {
  agent_id: string;
  tool_id: string;
}

import { MODEL_REGISTRY } from '@/lib/modelRegistry';

// Derive AI_MODELS from the unified registry
export const AI_MODELS = MODEL_REGISTRY.map(m => ({
  value: m.id,
  label: m.displayName,
  description: m.description,
  provider: m.provider,
  supportsWebSearch: m.capabilities.webSearch,
}));
