CREATE OR REPLACE FUNCTION public.upsert_summary_alert(
  _nodes_processed integer,
  _evaluations_analyzed integer,
  _status text DEFAULT 'success'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing_alert_id UUID;
  alert_title TEXT;
  alert_desc TEXT;
BEGIN
  -- Check for existing unresolved summary alert
  SELECT id INTO existing_alert_id
  FROM system_alerts
  WHERE alert_type = 'summary_generated'
    AND is_resolved = false
  LIMIT 1;
  
  alert_title := 'Improvement Summary Updated';
  alert_desc := CASE 
    WHEN _status = 'no_data' THEN 'No evaluations to analyze.'
    ELSE 'Generated summaries for ' || _nodes_processed || ' nodes from ' || _evaluations_analyzed || ' evaluations.'
  END;
  
  IF existing_alert_id IS NOT NULL THEN
    -- Update existing (increment occurrence, update stats)
    UPDATE system_alerts
    SET 
      occurrence_count = occurrence_count + 1,
      last_seen_at = now(),
      description = alert_desc,
      updated_at = now()
    WHERE id = existing_alert_id;
  ELSE
    -- Create new info-level alert
    INSERT INTO system_alerts (
      alert_type, severity, title, description, affected_model
    ) VALUES (
      'summary_generated',
      'info',
      alert_title,
      alert_desc,
      'self_improvement'
    );
  END IF;
END;
$$;