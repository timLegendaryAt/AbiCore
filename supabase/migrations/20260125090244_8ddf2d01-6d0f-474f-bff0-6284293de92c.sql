-- Create table for approved model pricing overrides
CREATE TABLE public.model_pricing_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id text UNIQUE NOT NULL,
  input_cost_per_million numeric,
  output_cost_per_million numeric,
  context_window integer,
  max_output_tokens integer,
  approved_at timestamp with time zone DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id),
  source_citation text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.model_pricing_overrides ENABLE ROW LEVEL SECURITY;

-- Platform admins can manage overrides
CREATE POLICY "Platform admins can manage model overrides"
ON public.model_pricing_overrides
FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- All authenticated users can read overrides (needed for cost calculations)
CREATE POLICY "Authenticated users can read model overrides"
ON public.model_pricing_overrides
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Add trigger for updated_at
CREATE TRIGGER update_model_pricing_overrides_updated_at
BEFORE UPDATE ON public.model_pricing_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();