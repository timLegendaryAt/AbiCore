export interface SystemPrompt {
  id: string;
  name: string;
  prompt: string;
  created_at: string;
  updated_at: string;
  tags?: PromptTag[];
}

export interface PromptTag {
  id: string;
  name: string;
  created_at?: string;
}

export interface SystemPromptTag {
  prompt_id: string;
  tag_id: string;
}
