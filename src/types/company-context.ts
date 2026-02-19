// L1C Domain Context Types
// Represents unscored facts/attributes that exist at the domain level

import { CompanyDomain, SourceType, FactCategory } from './company-master';

// Re-export FactCategory for consumers
export type { FactCategory } from './company-master';

/**
 * Context Fact Definition - Schema registry for available fact types
 */
export interface ContextFactDefinition {
  id: string;
  fact_key: string;
  display_name: string;
  description: string | null;
  fact_type: string;
  category: FactCategory;
  default_domains: CompanyDomain[];
  allowed_values: unknown[] | null;
  validation_rules: Record<string, unknown> | null;
  sort_order: number;
  icon_name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Context Fact - Canonical company-level fact storage
 */
export interface ContextFact {
  id: string;
  company_id: string;
  fact_key: string;
  display_name: string;
  fact_value: unknown;
  fact_type: string;
  category: FactCategory;
  source_type: SourceType;
  source_reference: Record<string, unknown> | null;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

/**
 * Domain Context Reference - Junction table linking facts to domains
 */
export interface DomainContextReference {
  id: string;
  fact_id: string;
  domain: CompanyDomain;
  relevance_note: string | null;
  sort_order: number;
  created_at: string;
}

/**
 * Context Fact with associated domains
 */
export interface ContextFactWithDomains extends ContextFact {
  domains: CompanyDomain[];
  domain_references?: DomainContextReference[];
}

/**
 * Score Influence Reference - Tracks how facts influence scoring
 */
export interface ScoreInfluenceReference {
  id: string;
  field_definition_id: string;
  fact_key: string;
  influence_type: 'benchmark_selector' | 'weight_modifier' | 'rubric_selector';
  influence_config: Record<string, unknown>;
  description: string | null;
  created_at: string;
}

/**
 * Category display metadata
 */
export const FACT_CATEGORY_CONFIG: Record<FactCategory, {
  label: string;
  icon: string;
  color: string;
}> = {
  attribute: {
    label: 'Attribute',
    icon: 'Tag',
    color: 'blue',
  },
  constraint: {
    label: 'Constraint',
    icon: 'AlertCircle',
    color: 'amber',
  },
  segment: {
    label: 'Segment',
    icon: 'Layers',
    color: 'purple',
  },
};
