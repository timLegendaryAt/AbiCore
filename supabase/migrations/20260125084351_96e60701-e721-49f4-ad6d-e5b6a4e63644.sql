-- Add model verification settings column to app_settings
ALTER TABLE app_settings 
ADD COLUMN IF NOT EXISTS model_verification_settings JSONB DEFAULT '{
  "enabled": false,
  "interval_days": 7,
  "last_run": null,
  "last_result": null
}'::jsonb;