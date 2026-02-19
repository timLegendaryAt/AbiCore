-- Rename organizations to companies
ALTER TABLE public.organizations RENAME TO companies;

-- Add company-specific columns
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS assigned_workflow_id uuid REFERENCES public.workflows(id) ON DELETE SET NULL;

-- Rename organization_id columns to company_id across tables
ALTER TABLE public.workflows RENAME COLUMN organization_id TO company_id;
ALTER TABLE public.datasets RENAME COLUMN organization_id TO company_id;
ALTER TABLE public.frameworks RENAME COLUMN organization_id TO company_id;
ALTER TABLE public.workflow_executions RENAME COLUMN organization_id TO company_id;
ALTER TABLE public.execution_runs RENAME COLUMN organization_id TO company_id;
ALTER TABLE public.job_queue RENAME COLUMN organization_id TO company_id;
ALTER TABLE public.data_snapshots RENAME COLUMN organization_id TO company_id;
ALTER TABLE public.scheduled_jobs RENAME COLUMN organization_id TO company_id;
ALTER TABLE public.webhook_endpoints RENAME COLUMN organization_id TO company_id;

-- Rename organization_members to company_admins (for internal admin assignment)
ALTER TABLE public.organization_members RENAME TO company_admins;
ALTER TABLE public.company_admins RENAME COLUMN organization_id TO company_id;

-- Rename organization_usage to company_usage
ALTER TABLE public.organization_usage RENAME TO company_usage;
ALTER TABLE public.company_usage RENAME COLUMN organization_id TO company_id;

-- Create company_data_submissions table for incoming raw data
CREATE TABLE public.company_data_submissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    submitted_at timestamptz NOT NULL DEFAULT now(),
    raw_data jsonb NOT NULL DEFAULT '{}',
    source_type text NOT NULL DEFAULT 'api',
    status text NOT NULL DEFAULT 'pending',
    metadata jsonb DEFAULT '{}',
    processed_at timestamptz,
    execution_run_id uuid REFERENCES public.execution_runs(id) ON DELETE SET NULL,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create company_outputs table for processed results
CREATE TABLE public.company_outputs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    execution_run_id uuid REFERENCES public.execution_runs(id) ON DELETE SET NULL,
    submission_id uuid REFERENCES public.company_data_submissions(id) ON DELETE SET NULL,
    output_data jsonb NOT NULL DEFAULT '{}',
    output_type text DEFAULT 'transformation_result',
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_company_data_submissions_company_id ON public.company_data_submissions(company_id);
CREATE INDEX idx_company_data_submissions_status ON public.company_data_submissions(status);
CREATE INDEX idx_company_data_submissions_submitted_at ON public.company_data_submissions(submitted_at DESC);
CREATE INDEX idx_company_outputs_company_id ON public.company_outputs(company_id);
CREATE INDEX idx_company_outputs_created_at ON public.company_outputs(created_at DESC);
CREATE INDEX idx_companies_status ON public.companies(status);
CREATE INDEX idx_companies_api_key ON public.companies(api_key);

-- Add updated_at trigger for company_data_submissions
CREATE TRIGGER update_company_data_submissions_updated_at
    BEFORE UPDATE ON public.company_data_submissions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Create helper function to get company by API key
CREATE OR REPLACE FUNCTION public.get_company_by_api_key(_api_key text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT id FROM public.companies WHERE api_key = _api_key AND status = 'active' LIMIT 1
$$;

-- Create function to generate next output version for a company
CREATE OR REPLACE FUNCTION public.next_output_version(_company_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(MAX(version), 0) + 1
    FROM public.company_outputs
    WHERE company_id = _company_id
$$;