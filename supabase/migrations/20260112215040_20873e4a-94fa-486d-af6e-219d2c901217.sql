-- Enable RLS on all company tables
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_data_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_usage ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is a company member
CREATE OR REPLACE FUNCTION public.is_company_member(_user_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.company_admins
        WHERE user_id = _user_id
          AND company_id = _company_id
    )
$$;

-- Helper function to check if user is platform admin
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles
        WHERE user_id = _user_id
          AND role IN ('super_admin', 'owner', 'admin')
    )
$$;

-- COMPANIES TABLE POLICIES
CREATE POLICY "Platform admins can manage companies"
ON public.companies FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Company members can view their company"
ON public.companies FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), id));

-- COMPANY_ADMINS TABLE POLICIES
CREATE POLICY "Platform admins can manage company admins"
ON public.company_admins FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Users can view their own memberships"
ON public.company_admins FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- COMPANY_DATA_SUBMISSIONS TABLE POLICIES
CREATE POLICY "Platform admins can manage submissions"
ON public.company_data_submissions FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Company members can view their submissions"
ON public.company_data_submissions FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

-- COMPANY_OUTPUTS TABLE POLICIES
CREATE POLICY "Platform admins can manage outputs"
ON public.company_outputs FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Company members can view their outputs"
ON public.company_outputs FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

-- COMPANY_USAGE TABLE POLICIES
CREATE POLICY "Platform admins can manage usage"
ON public.company_usage FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Company members can view their usage"
ON public.company_usage FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));