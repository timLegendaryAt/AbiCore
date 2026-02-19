-- Phase 4: Data Pipeline Infrastructure

-- Create execution status enum
CREATE TYPE public.execution_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');

-- Create trigger type enum
CREATE TYPE public.trigger_type AS ENUM ('manual', 'scheduled', 'webhook', 'api');

-- Create job priority enum
CREATE TYPE public.job_priority AS ENUM ('low', 'normal', 'high', 'critical');

-- Enhanced execution runs table
CREATE TABLE public.execution_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    status execution_status NOT NULL DEFAULT 'queued',
    trigger_type trigger_type NOT NULL DEFAULT 'manual',
    triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    input_data JSONB DEFAULT '{}',
    output_data JSONB,
    error_message TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Execution steps table (tracks each node execution)
CREATE TABLE public.execution_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_run_id UUID NOT NULL REFERENCES public.execution_runs(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    node_type TEXT NOT NULL,
    node_label TEXT,
    status execution_status NOT NULL DEFAULT 'queued',
    input_data JSONB,
    output_data JSONB,
    error_message TEXT,
    tokens_used INTEGER DEFAULT 0,
    execution_order INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Job queue table for scalable processing
CREATE TABLE public.job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    execution_run_id UUID REFERENCES public.execution_runs(id) ON DELETE CASCADE,
    priority job_priority NOT NULL DEFAULT 'normal',
    status execution_status NOT NULL DEFAULT 'queued',
    payload JSONB NOT NULL DEFAULT '{}',
    result JSONB,
    error_message TEXT,
    worker_id TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
    picked_up_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Data snapshots for versioning
CREATE TABLE public.data_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    snapshot_data JSONB NOT NULL DEFAULT '[]',
    row_count INTEGER NOT NULL DEFAULT 0,
    size_bytes BIGINT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (dataset_id, version)
);

-- Webhook endpoints table
CREATE TABLE public.webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    trigger_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scheduled jobs table
CREATE TABLE public.scheduled_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    cron_expression TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    input_data JSONB DEFAULT '{}',
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    run_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX idx_execution_runs_workflow ON public.execution_runs(workflow_id);
CREATE INDEX idx_execution_runs_org ON public.execution_runs(organization_id);
CREATE INDEX idx_execution_runs_status ON public.execution_runs(status);
CREATE INDEX idx_execution_runs_created ON public.execution_runs(created_at DESC);

CREATE INDEX idx_execution_steps_run ON public.execution_steps(execution_run_id);
CREATE INDEX idx_execution_steps_order ON public.execution_steps(execution_run_id, execution_order);

CREATE INDEX idx_job_queue_status ON public.job_queue(status, priority, scheduled_for);
CREATE INDEX idx_job_queue_org ON public.job_queue(organization_id);
CREATE INDEX idx_job_queue_scheduled ON public.job_queue(scheduled_for) WHERE status = 'queued';

CREATE INDEX idx_data_snapshots_dataset ON public.data_snapshots(dataset_id);
CREATE INDEX idx_data_snapshots_version ON public.data_snapshots(dataset_id, version DESC);

CREATE INDEX idx_webhook_endpoints_org ON public.webhook_endpoints(organization_id);
CREATE INDEX idx_webhook_endpoints_workflow ON public.webhook_endpoints(workflow_id);
CREATE INDEX idx_webhook_endpoints_secret ON public.webhook_endpoints(secret_key);

CREATE INDEX idx_scheduled_jobs_org ON public.scheduled_jobs(organization_id);
CREATE INDEX idx_scheduled_jobs_next_run ON public.scheduled_jobs(next_run_at) WHERE is_active = true;

-- Triggers for updated_at
CREATE TRIGGER update_execution_runs_updated_at
    BEFORE UPDATE ON public.execution_runs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_job_queue_updated_at
    BEFORE UPDATE ON public.job_queue
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_webhook_endpoints_updated_at
    BEFORE UPDATE ON public.webhook_endpoints
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_scheduled_jobs_updated_at
    BEFORE UPDATE ON public.scheduled_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Function to generate webhook secret
CREATE OR REPLACE FUNCTION public.generate_webhook_secret()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.secret_key IS NULL THEN
        NEW.secret_key := 'whsec_' || encode(gen_random_bytes(32), 'hex');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_webhook_secret
    BEFORE INSERT ON public.webhook_endpoints
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_webhook_secret();

-- Function to increment data snapshot version
CREATE OR REPLACE FUNCTION public.next_snapshot_version(_dataset_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(MAX(version), 0) + 1
    FROM public.data_snapshots
    WHERE dataset_id = _dataset_id
$$;