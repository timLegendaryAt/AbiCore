-- Backfill existing evaluations from company_node_data to evaluation_history
INSERT INTO evaluation_history (
  company_id, workflow_id, node_id, node_label,
  hallucination_score, hallucination_reasoning,
  data_quality_score, data_quality_reasoning,
  complexity_score, complexity_reasoning,
  overall_score, flags, evaluated_at
)
SELECT 
  company_id, workflow_id, node_id, node_label,
  (data->'evaluation'->'hallucination'->>'score')::int,
  data->'evaluation'->'hallucination'->>'reasoning',
  (data->'evaluation'->'dataQuality'->>'score')::int,
  data->'evaluation'->'dataQuality'->>'reasoning',
  (data->'evaluation'->'complexity'->>'score')::int,
  data->'evaluation'->'complexity'->>'reasoning',
  (data->'evaluation'->>'overallScore')::int,
  ARRAY[]::text[],
  COALESCE((data->'evaluation'->>'evaluatedAt')::timestamptz, updated_at)
FROM company_node_data
WHERE data->'evaluation' IS NOT NULL
  AND (data->'evaluation'->>'overallScore') IS NOT NULL
ON CONFLICT DO NOTHING;

-- Add cleanup function for evaluation history
CREATE OR REPLACE FUNCTION cleanup_evaluation_history(_keep_limit INT DEFAULT 20)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  deleted_count INT;
BEGIN
  WITH ranked AS (
    SELECT id, 
           ROW_NUMBER() OVER (
             PARTITION BY node_id, company_id 
             ORDER BY evaluated_at DESC
           ) as rn,
           overall_score,
           flags
    FROM evaluation_history
  ),
  to_delete AS (
    SELECT id FROM ranked 
    WHERE rn > _keep_limit
    AND (overall_score IS NULL OR overall_score >= 50)
    AND (flags IS NULL OR array_length(flags, 1) IS NULL OR array_length(flags, 1) = 0)
  )
  DELETE FROM evaluation_history 
  WHERE id IN (SELECT id FROM to_delete);
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Add improvement_summaries column to app_settings (stores AI-generated summaries per metric)
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS improvement_summaries JSONB DEFAULT '{}'::jsonb;

-- Add summary_schedule column to app_settings (tracks scheduling config)
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS summary_schedule JSONB DEFAULT '{"enabled": false, "frequency": "daily", "last_run": null}'::jsonb;