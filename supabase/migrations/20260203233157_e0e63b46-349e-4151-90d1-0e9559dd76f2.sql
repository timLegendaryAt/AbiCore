-- Function to create/update execution summary alerts
CREATE OR REPLACE FUNCTION upsert_execution_summary_alert(
  _company_id UUID,
  _company_name TEXT,
  _workflow_ids UUID[],
  _total_workflows INT,
  _executed_workflows INT,
  _skipped_workflows INT,
  _total_nodes INT,
  _executed_nodes INT,
  _cached_nodes INT,
  _paused_nodes INT,
  _empty_outputs INT,
  _issues JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_alert_id UUID;
  alert_title TEXT;
  alert_desc TEXT;
  alert_severity TEXT;
  has_issues BOOLEAN;
  issue_count INT;
BEGIN
  -- Count issues
  issue_count := COALESCE(jsonb_array_length(_issues), 0);
  has_issues := issue_count > 0 OR _skipped_workflows > 0 OR _empty_outputs > 0 OR (_paused_nodes::float / NULLIF(_total_nodes, 0)::float > 0.5);
  
  -- Determine severity
  alert_severity := CASE
    WHEN _executed_workflows = 0 AND _total_workflows > 0 THEN 'critical'
    WHEN _empty_outputs > (_total_nodes * 0.2) THEN 'warning'
    WHEN _paused_nodes::float / NULLIF(_total_nodes, 0)::float > 0.5 THEN 'warning'
    WHEN _skipped_workflows > 0 THEN 'warning'
    WHEN issue_count > 0 THEN 'warning'
    ELSE 'info'
  END;
  
  -- Build title and description
  alert_title := 'Execution Summary: ' || _company_name;
  
  alert_desc := _executed_workflows || '/' || _total_workflows || ' workflows ran. ' ||
    _executed_nodes || ' nodes executed, ' || _cached_nodes || ' cached';
  
  IF _paused_nodes > 0 THEN
    alert_desc := alert_desc || ', ' || _paused_nodes || ' paused';
  END IF;
  
  IF _empty_outputs > 0 THEN
    alert_desc := alert_desc || ', ' || _empty_outputs || ' empty outputs';
  END IF;
  
  IF issue_count > 0 THEN
    alert_desc := alert_desc || '. ' || issue_count || ' issues detected.';
  ELSE
    alert_desc := alert_desc || '.';
  END IF;
  
  -- Check for existing unresolved execution summary for this company
  SELECT id INTO existing_alert_id
  FROM system_alerts
  WHERE affected_model = _company_id::text
    AND is_resolved = false
    AND alert_type = 'execution_summary'
  LIMIT 1;
  
  IF existing_alert_id IS NOT NULL THEN
    -- Update existing alert
    UPDATE system_alerts
    SET 
      occurrence_count = occurrence_count + 1,
      last_seen_at = now(),
      title = alert_title,
      description = alert_desc,
      severity = alert_severity,
      affected_nodes = _issues,
      updated_at = now()
    WHERE id = existing_alert_id;
  ELSE
    -- Create new alert
    INSERT INTO system_alerts (
      alert_type, severity, title, description,
      affected_model, affected_nodes, action_url
    ) VALUES (
      'execution_summary',
      alert_severity,
      alert_title,
      alert_desc,
      _company_id::text,
      _issues,
      '/companies'
    );
  END IF;
END;
$$;