-- Phase 3: Multi-Tenancy Architecture

-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('owner', 'admin', 'member', 'viewer');

-- Create plan_tier enum for organization plans
CREATE TYPE public.plan_tier AS ENUM ('free', 'starter', 'professional', 'enterprise');

-- Organizations table
CREATE TABLE public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    plan_tier plan_tier NOT NULL DEFAULT 'free',
    settings JSONB NOT NULL DEFAULT '{}',
    api_key TEXT UNIQUE,
    rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
    storage_quota_mb INTEGER NOT NULL DEFAULT 1000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Organization members table (linking users to organizations with roles)
CREATE TABLE public.organization_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL DEFAULT 'member',
    invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, user_id)
);

-- Organization usage tracking table
CREATE TABLE public.organization_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    period DATE NOT NULL, -- First day of the month
    workflow_executions INTEGER NOT NULL DEFAULT 0,
    ai_tokens_used BIGINT NOT NULL DEFAULT 0,
    data_processed_mb NUMERIC(12, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, period)
);

-- User roles table for admin access (separate from org membership)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role app_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Add organization_id to existing tables
ALTER TABLE public.workflows ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.datasets ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.frameworks ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.workflow_executions ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX idx_organizations_slug ON public.organizations(slug);
CREATE INDEX idx_organizations_api_key ON public.organizations(api_key);
CREATE INDEX idx_org_members_user_id ON public.organization_members(user_id);
CREATE INDEX idx_org_members_org_id ON public.organization_members(organization_id);
CREATE INDEX idx_org_usage_org_period ON public.organization_usage(organization_id, period);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_workflows_org_id ON public.workflows(organization_id);
CREATE INDEX idx_datasets_org_id ON public.datasets(organization_id);
CREATE INDEX idx_frameworks_org_id ON public.frameworks(organization_id);
CREATE INDEX idx_workflow_executions_org_id ON public.workflow_executions(organization_id);

-- Security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role = _role
    )
$$;

-- Function to check organization membership
CREATE OR REPLACE FUNCTION public.is_org_member(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.organization_members
        WHERE user_id = _user_id
          AND organization_id = _org_id
    )
$$;

-- Function to get user's organization role
CREATE OR REPLACE FUNCTION public.get_org_role(_user_id UUID, _org_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
    LIMIT 1
$$;

-- Trigger for updated_at on organizations
CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for updated_at on organization_usage
CREATE TRIGGER update_org_usage_updated_at
    BEFORE UPDATE ON public.organization_usage
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Generate unique API key for new organizations
CREATE OR REPLACE FUNCTION public.generate_org_api_key()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.api_key IS NULL THEN
        NEW.api_key := 'org_' || encode(gen_random_bytes(24), 'hex');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_org_api_key
    BEFORE INSERT ON public.organizations
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_org_api_key();