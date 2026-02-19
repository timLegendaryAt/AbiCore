// Master Company Database - Single Source of Truth Types
// 4-Level hierarchical schema for company health scoring

export type CompanyDomain =
  | 'overview'
  | 'leadership'
  | 'strategy'
  | 'product'
  | 'operations'
  | 'market'
  | 'revenue'
  | 'customer'
  | 'people'
  | 'finance';

export type SSOTLevel = 'L1' | 'L1C' | 'L2' | 'L3' | 'L4';
export type FactCategory = 'attribute' | 'constraint' | 'segment';
export type FieldType = 'text' | 'number' | 'date' | 'boolean' | 'array' | 'object' | 'url';
export type SourceType = 'manual' | 'generated' | 'imported' | 'api';
export type ChangeType = 'create' | 'update' | 'delete';
export type EvaluationMethod = 'benchmark' | 'rubric' | 'ai' | 'formula';

export interface CompanyMasterData {
  id: string;
  company_id: string;
  domain: CompanyDomain;
  field_key: string;
  field_value: unknown;
  field_type: FieldType;
  confidence_score: number | null;
  source_type: SourceType;
  source_reference: {
    workflow_id?: string;
    node_id?: string;
    import_id?: string;
    submission_id?: string;
  } | null;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  // Scoring fields (for L2/L3)
  score: number | null;
  score_confidence: number | null;
  score_reasoning: string | null;
  score_calculated_at: string | null;
  aggregated_from: string[] | null;
}

export interface CompanyMasterDataHistory {
  id: string;
  master_data_id: string;
  company_id: string;
  domain: CompanyDomain;
  field_key: string;
  previous_value: unknown;
  new_value: unknown;
  change_type: ChangeType;
  changed_by: string | null;
  change_source: string | null;
  change_metadata: Record<string, unknown> | null;
  version: number;
  created_at: string;
}

export interface DomainDefinition {
  domain: CompanyDomain;
  display_name: string;
  description: string | null;
  icon_name: string | null;
  sort_order: number;
  color: string | null;
  // RAG optimization fields
  retrieval_priority: number;
  context_keywords: string[] | null;
  typical_queries: string[] | null;
}

export interface FieldDefinition {
  id: string;
  domain: CompanyDomain;
  field_key: string;
  display_name: string;
  description: string | null;
  field_type: FieldType;
  is_required: boolean;
  validation_rules: Record<string, unknown> | null;
  default_value: unknown;
  sort_order: number;
  // Hierarchy fields
  level: SSOTLevel;
  parent_field_id: string | null;
  // Scoring fields
  is_scored: boolean;
  evaluation_method: EvaluationMethod | null;
  evaluation_config: Record<string, unknown> | null;
  score_weight: number;
  benchmark_reference: Record<string, unknown> | null;
  // RAG optimization fields
  semantic_description: string | null;
  semantic_tags: string[] | null;
  importance_score: number;
  retrieval_context: string | null;
  related_fields: string[] | null;
}

export interface CompanyDomainScore {
  id: string;
  company_id: string;
  domain: CompanyDomain;
  score: number | null;
  confidence: number | null;
  reasoning: string | null;
  contributing_fields: Array<{ field_key: string; score: number }> | null;
  calculated_at: string;
  created_at: string;
  updated_at: string;
}

// Utility type for grouping master data by domain
export type MasterDataByDomain = Record<CompanyDomain, CompanyMasterData[]>;

// Utility type for hierarchical field structure
export interface FieldHierarchy {
  l2: FieldDefinition;
  l3: FieldDefinition[];
  l4ByL3: Record<string, FieldDefinition[]>;
}

export type DomainFieldHierarchy = Record<CompanyDomain, FieldHierarchy | null>;

// Domain icon mapping for UI
export const DOMAIN_ICONS: Record<CompanyDomain, string> = {
  overview: 'FileText',
  leadership: 'Users',
  strategy: 'Target',
  product: 'Package',
  operations: 'Settings',
  market: 'TrendingUp',
  revenue: 'DollarSign',
  customer: 'Heart',
  people: 'UserCheck',
  finance: 'Wallet',
};

// Domain color mapping for UI
export const DOMAIN_COLORS: Record<CompanyDomain, string> = {
  overview: 'indigo',
  leadership: 'blue',
  strategy: 'purple',
  product: 'green',
  operations: 'orange',
  market: 'cyan',
  revenue: 'emerald',
  customer: 'pink',
  people: 'amber',
  finance: 'slate',
};

// All domains in display order
export const ALL_DOMAINS: CompanyDomain[] = [
  'overview',
  'leadership',
  'strategy',
  'product',
  'operations',
  'market',
  'revenue',
  'customer',
  'people',
  'finance',
];

// Domains that support scoring (exclude overview)
export const SCORED_DOMAINS: CompanyDomain[] = [
  'leadership',
  'strategy',
  'product',
  'operations',
  'market',
  'revenue',
  'customer',
  'people',
  'finance',
];

// Score thresholds for UI display
export const SCORE_THRESHOLDS = {
  excellent: 85,
  good: 70,
  fair: 50,
  poor: 0,
} as const;

export function getScoreLabel(score: number | null): string {
  if (score === null) return 'Not scored';
  if (score >= SCORE_THRESHOLDS.excellent) return 'Excellent';
  if (score >= SCORE_THRESHOLDS.good) return 'Good';
  if (score >= SCORE_THRESHOLDS.fair) return 'Fair';
  return 'Needs Attention';
}

export function getScoreColor(score: number | null): string {
  if (score === null) return 'muted';
  if (score >= SCORE_THRESHOLDS.excellent) return 'emerald';
  if (score >= SCORE_THRESHOLDS.good) return 'green';
  if (score >= SCORE_THRESHOLDS.fair) return 'amber';
  return 'red';
}
