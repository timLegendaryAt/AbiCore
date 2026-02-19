export interface Company {
  id: string;
  name: string;
  slug: string;
  status: string;
  contact_email: string | null;
  metadata: Record<string, unknown>;
  assigned_workflow_id: string | null;
  api_key: string | null;
  plan_tier: 'free' | 'starter' | 'professional' | 'enterprise';
  rate_limit_rpm: number;
  storage_quota_mb: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CompanyDataSubmission {
  id: string;
  company_id: string;
  submitted_at: string;
  raw_data: Record<string, unknown>;
  source_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  metadata: Record<string, unknown>;
  processed_at: string | null;
  execution_run_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CompanyOutput {
  id: string;
  company_id: string;
  execution_run_id: string | null;
  submission_id: string | null;
  output_data: Record<string, unknown>;
  output_type: string;
  version: number;
  created_at: string;
}
