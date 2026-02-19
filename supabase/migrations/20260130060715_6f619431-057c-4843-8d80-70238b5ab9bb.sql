-- Create shared_caches table
CREATE TABLE public.shared_caches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  schema JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shared_caches ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view shared caches"
  ON public.shared_caches FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Platform admins can manage shared caches"
  ON public.shared_caches FOR ALL
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));