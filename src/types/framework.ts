export type FrameworkType = 'rating_scale' | 'rubric' | 'criteria' | 'custom' | 'document';

export interface Framework {
  id: string;
  name: string;
  description: string | null;
  schema: Record<string, any>;
  type: FrameworkType;
  category: string | null;
  workflow_association: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  is_template: boolean | null;
  language: string | null;
  score: string | null;
}

export interface FrameworkFormData {
  name: string;
  description: string;
  type: FrameworkType;
  category: string;
  workflow_association: string;
  schema: string;
  language: string;
  score: string;
  is_template: boolean;
}
