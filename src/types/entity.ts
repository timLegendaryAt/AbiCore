export interface Entity {
  id: string;
  name: string;
  slug: string;
  entity_type: 'external_platform' | 'internal' | 'integration';
  description: string | null;
  icon_name: string | null;
  color: string | null;
  metadata: Record<string, unknown>;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface EntityNodeData {
  id: string;
  entity_id: string;
  workflow_id: string;
  node_id: string;
  node_type: string;
  node_label: string | null;
  data: { output?: unknown } | null;
  content_hash: string | null;
  dependency_hashes: Record<string, unknown> | null;
  last_executed_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}
