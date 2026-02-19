-- Create table to store evaluation history for last 20 generations per node/company
CREATE TABLE public.evaluation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    node_id TEXT NOT NULL,
    node_label TEXT,
    hallucination_score INTEGER,
    hallucination_reasoning TEXT,
    data_quality_score INTEGER,
    data_quality_reasoning TEXT,
    complexity_score INTEGER,
    complexity_reasoning TEXT,
    overall_score INTEGER,
    flags TEXT[] DEFAULT '{}',
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient querying of recent evaluations
CREATE INDEX idx_evaluation_history_lookup ON public.evaluation_history(company_id, workflow_id, node_id, evaluated_at DESC);
CREATE INDEX idx_evaluation_history_recent ON public.evaluation_history(evaluated_at DESC);

-- Enable RLS
ALTER TABLE public.evaluation_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Platform admins can manage evaluation history"
ON public.evaluation_history FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

CREATE POLICY "Company members can view their evaluation history"
ON public.evaluation_history FOR SELECT
USING (is_company_member(auth.uid(), company_id));

-- Add low_quality_fields column to company_node_data for tracking fields with data quality issues
ALTER TABLE public.company_node_data 
ADD COLUMN IF NOT EXISTS low_quality_fields JSONB DEFAULT '[]';

-- Create function to upsert quality alerts when scores are below threshold
CREATE OR REPLACE FUNCTION public.upsert_quality_alert(
    _company_id UUID,
    _company_name TEXT,
    _node_id TEXT,
    _node_label TEXT,
    _alert_type TEXT,
    _score INTEGER,
    _reasoning TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    existing_alert_id UUID;
    alert_title TEXT;
    alert_severity TEXT;
BEGIN
    -- Build alert title based on type
    alert_title := CASE _alert_type
        WHEN 'hallucination' THEN 'High Hallucination: ' || _company_name || ' - ' || COALESCE(_node_label, _node_id)
        WHEN 'data_quality' THEN 'Low Data Quality: ' || _company_name || ' - ' || COALESCE(_node_label, _node_id)
        WHEN 'complexity' THEN 'High Complexity: ' || _company_name || ' - ' || COALESCE(_node_label, _node_id)
        ELSE 'Quality Issue: ' || _company_name
    END;
    
    -- Set severity based on score
    alert_severity := CASE
        WHEN _score < 30 THEN 'critical'
        WHEN _score < 50 THEN 'warning'
        ELSE 'info'
    END;
    
    -- Check for existing unresolved alert
    SELECT id INTO existing_alert_id
    FROM system_alerts
    WHERE affected_model = _company_id::text || ':' || _node_id || ':' || _alert_type
      AND is_resolved = false
      AND alert_type = 'quality_' || _alert_type
    LIMIT 1;
    
    IF existing_alert_id IS NOT NULL THEN
        -- Update existing alert
        UPDATE system_alerts
        SET 
            occurrence_count = occurrence_count + 1,
            last_seen_at = now(),
            description = 'Score: ' || _score || '%. ' || LEFT(_reasoning, 500),
            severity = alert_severity,
            updated_at = now()
        WHERE id = existing_alert_id;
    ELSE
        -- Create new alert
        INSERT INTO system_alerts (
            alert_type, severity, title, description,
            affected_model, affected_nodes, error_pattern
        ) VALUES (
            'quality_' || _alert_type,
            alert_severity,
            alert_title,
            'Score: ' || _score || '%. ' || LEFT(_reasoning, 500),
            _company_id::text || ':' || _node_id || ':' || _alert_type,
            jsonb_build_array(_node_id),
            'Quality score below 50%'
        );
    END IF;
END;
$$;

-- Create function to get aggregated evaluation stats for last N generations
CREATE OR REPLACE FUNCTION public.get_evaluation_stats(_limit INTEGER DEFAULT 20)
RETURNS TABLE (
    metric TEXT,
    avg_score NUMERIC,
    min_score INTEGER,
    max_score INTEGER,
    count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH recent_evals AS (
        SELECT 
            hallucination_score,
            data_quality_score,
            complexity_score
        FROM evaluation_history
        ORDER BY evaluated_at DESC
        LIMIT _limit
    )
    SELECT 'hallucination'::TEXT, 
           ROUND(AVG(hallucination_score), 1), 
           MIN(hallucination_score), 
           MAX(hallucination_score),
           COUNT(*)
    FROM recent_evals
    WHERE hallucination_score IS NOT NULL
    UNION ALL
    SELECT 'data_quality'::TEXT, 
           ROUND(AVG(data_quality_score), 1), 
           MIN(data_quality_score), 
           MAX(data_quality_score),
           COUNT(*)
    FROM recent_evals
    WHERE data_quality_score IS NOT NULL
    UNION ALL
    SELECT 'complexity'::TEXT, 
           ROUND(AVG(complexity_score), 1), 
           MIN(complexity_score), 
           MAX(complexity_score),
           COUNT(*)
    FROM recent_evals
    WHERE complexity_score IS NOT NULL
$$;