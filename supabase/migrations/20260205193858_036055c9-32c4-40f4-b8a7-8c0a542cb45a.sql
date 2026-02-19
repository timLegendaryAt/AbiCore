
-- Enable RLS on remaining tables

-- 1. WEBHOOK_ENDPOINTS TABLE
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage webhook endpoints"
ON public.webhook_endpoints FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view webhook endpoints"
ON public.webhook_endpoints FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- 2. SCHEDULED_JOBS TABLE
ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage scheduled jobs"
ON public.scheduled_jobs FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view scheduled jobs"
ON public.scheduled_jobs FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- 3. WORKFLOW_EXECUTIONS TABLE
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage workflow executions"
ON public.workflow_executions FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view workflow executions"
ON public.workflow_executions FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);
