
-- ============================================
-- Enable RLS on all tables without breaking existing workflows
-- Edge functions use service_role key (bypasses RLS)
-- Security definer functions bypass RLS
-- ============================================

-- 1. WORKFLOWS TABLE
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage workflows"
ON public.workflows FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view workflows"
ON public.workflows FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- 2. EXECUTION_RUNS TABLE
ALTER TABLE public.execution_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage execution runs"
ON public.execution_runs FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Company members can view their execution runs"
ON public.execution_runs FOR SELECT TO authenticated
USING (company_id IS NULL OR public.is_company_member(auth.uid(), company_id));

-- 3. EXECUTION_STEPS TABLE
ALTER TABLE public.execution_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage execution steps"
ON public.execution_steps FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view execution steps"
ON public.execution_steps FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- 4. JOB_QUEUE TABLE
ALTER TABLE public.job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage job queue"
ON public.job_queue FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Company members can view their jobs"
ON public.job_queue FOR SELECT TO authenticated
USING (company_id IS NULL OR public.is_company_member(auth.uid(), company_id));

-- 5. FRAMEWORKS TABLE
ALTER TABLE public.frameworks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage frameworks"
ON public.frameworks FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view frameworks"
ON public.frameworks FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- 6. DATASETS TABLE
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage datasets"
ON public.datasets FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view datasets"
ON public.datasets FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- 7. DATA_SNAPSHOTS TABLE
ALTER TABLE public.data_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage snapshots"
ON public.data_snapshots FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Company members can view their snapshots"
ON public.data_snapshots FOR SELECT TO authenticated
USING (company_id IS NULL OR public.is_company_member(auth.uid(), company_id));

-- 8. INTEGRATIONS TABLE
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage integrations"
ON public.integrations FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view integrations"
ON public.integrations FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- 9. AI_AGENTS TABLE
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage AI agents"
ON public.ai_agents FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view AI agents"
ON public.ai_agents FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- 10. AI_AGENT_TOOLS TABLE
ALTER TABLE public.ai_agent_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage AI agent tools"
ON public.ai_agent_tools FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view AI agent tools"
ON public.ai_agent_tools FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- 11. AI_TOOLS TABLE
ALTER TABLE public.ai_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage AI tools"
ON public.ai_tools FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view AI tools"
ON public.ai_tools FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- 12. APP_SETTINGS TABLE
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage app settings"
ON public.app_settings FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view app settings"
ON public.app_settings FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);

-- 13. NODE_SCHEMAS TABLE
ALTER TABLE public.node_schemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage node schemas"
ON public.node_schemas FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view node schemas"
ON public.node_schemas FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL);
