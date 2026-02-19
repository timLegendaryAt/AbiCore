-- Add self_improvement_settings column to app_settings
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS self_improvement_settings JSONB DEFAULT '{"enabled": true, "alert_threshold": 50, "evaluation_limit": 20, "auto_tag_low_quality": true}'::jsonb;