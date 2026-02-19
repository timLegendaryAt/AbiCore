-- Create prompt snippets table for user-saved text selections
CREATE TABLE public.prompt_snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.prompt_snippets ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to manage snippets (shared across org)
CREATE POLICY "Authenticated users can view snippets" 
  ON public.prompt_snippets 
  FOR SELECT 
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can create snippets" 
  ON public.prompt_snippets 
  FOR INSERT 
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update snippets" 
  ON public.prompt_snippets 
  FOR UPDATE 
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete snippets" 
  ON public.prompt_snippets 
  FOR DELETE 
  USING (auth.uid() IS NOT NULL);