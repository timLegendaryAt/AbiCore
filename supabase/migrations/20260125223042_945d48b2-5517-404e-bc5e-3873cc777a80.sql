-- Add usage_category column to track different types of AI costs
ALTER TABLE ai_usage_logs 
ADD COLUMN usage_category TEXT DEFAULT 'generation';

-- Add index for efficient category filtering
CREATE INDEX idx_ai_usage_logs_category ON ai_usage_logs(usage_category);