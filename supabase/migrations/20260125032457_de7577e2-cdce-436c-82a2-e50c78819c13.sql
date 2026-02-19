-- Create system_prompts table
CREATE TABLE public.system_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  prompt text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create prompt_tags table
CREATE TABLE public.prompt_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create junction table for many-to-many relationship
CREATE TABLE public.system_prompt_tags (
  prompt_id uuid REFERENCES public.system_prompts(id) ON DELETE CASCADE,
  tag_id uuid REFERENCES public.prompt_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (prompt_id, tag_id)
);

-- Enable RLS on all tables
ALTER TABLE public.system_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_prompt_tags ENABLE ROW LEVEL SECURITY;

-- RLS policies for system_prompts
CREATE POLICY "Platform admins can manage system prompts"
ON public.system_prompts
FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view system prompts"
ON public.system_prompts
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS policies for prompt_tags
CREATE POLICY "Platform admins can manage prompt tags"
ON public.prompt_tags
FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view prompt tags"
ON public.prompt_tags
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- RLS policies for system_prompt_tags
CREATE POLICY "Platform admins can manage prompt tag associations"
ON public.system_prompt_tags
FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY "Authenticated users can view prompt tag associations"
ON public.system_prompt_tags
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Trigger for updated_at on system_prompts
CREATE TRIGGER update_system_prompts_updated_at
  BEFORE UPDATE ON public.system_prompts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();