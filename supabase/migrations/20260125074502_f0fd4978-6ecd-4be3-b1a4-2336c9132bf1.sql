-- Add dependency_changed_at column to track when dependencies were last updated
ALTER TABLE public.ai_usage_logs
ADD COLUMN IF NOT EXISTS dependency_changed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.ai_usage_logs.dependency_changed_at 
IS 'Timestamp when the triggering dependency was last updated';