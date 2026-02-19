// SSOT Change Plan types for AI-generated change proposals

export interface SSOTChangePlan {
  plan_summary: string[];
  validated_changes: SSOTChange[];
  new_structure_additions: StructureAddition[];
  plan_exceptions: PlanException[];
}

export interface SSOTChange {
  change_id: string;              // CHG-001, CHG-002, etc.
  target_path: {
    l1: string;                   // Domain (immutable)
    l2?: string;
    l3?: string;
    l4?: string;
  };
  target_level: 'L2' | 'L3' | 'L4' | 'L1C';
  action: 'overwrite' | 'append' | 'create_field';
  data_type: 'attribute_fact' | 'measurement' | 'evidence' | 'metric' | 'score';
  is_scored: boolean;
  evaluation_method?: string;
  input_field_ids?: string[];
  value_to_write: any;
  current_value?: any;
  provenance: {
    source: string;
    timestamp: string;
    author?: string;
  };
  notes?: string;
  preconditions?: string[];
}

export interface StructureAddition {
  type: 'L2' | 'L3';
  parent_path: { l1: string; l2?: string };
  field_key: string;
  display_name: string;
  field_type: string;
  is_scored: boolean;
  evaluation_method?: string;
  score_weight?: number;
}

export interface PlanException {
  change_id?: string;
  reason: string;
  disposition: 'return_to_consensus' | 'propose_context_update' | 'request_clarification';
  original_request?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SSOTPendingChange {
  id: string;
  company_id: string;
  workflow_id?: string;
  node_id?: string;
  execution_run_id?: string;
  change_id: string;
  target_level: 'L2' | 'L3' | 'L4' | 'L1C';
  target_domain: string;
  target_path: {
    l1: string;
    l2?: string;
    l3?: string;
    l4?: string;
  };
  action: string;
  data_type: string;
  is_scored: boolean;
  evaluation_method?: string;
  input_field_ids?: string[];
  current_value?: any;
  proposed_value: any;
  provenance?: {
    source: string;
    timestamp: string;
    author?: string;
  };
  validation_status: 'pending' | 'valid' | 'invalid';
  validation_errors?: string[];
  validation_warnings?: string[];
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
  alert_id?: string;
  created_at: string;
  updated_at: string;
}

export interface SSOTUpdateConfig {
  target_company_source: 'current' | 'from_input';
  auto_approve_l4: boolean;
  require_approval_create: boolean;
  schema_only?: boolean;  // Only process create_field actions, reject overwrite/append
}

export interface ProcessChangeResult {
  change_id: string;
  pending_change_id: string;
  alert_id?: string;
  validation_status: 'valid' | 'invalid';
  errors: string[];
  warnings: string[];
  auto_approved?: boolean;
}

export interface ExecuteSSOTChangesRequest {
  company_id: string;
  workflow_id: string;
  node_id: string;
  execution_run_id?: string;
  plan: SSOTChangePlan;
  config?: SSOTUpdateConfig;
}

export interface ExecuteSSOTChangesResponse {
  success: boolean;
  changes_processed: number;
  results: ProcessChangeResult[];
  errors?: string[];
}
