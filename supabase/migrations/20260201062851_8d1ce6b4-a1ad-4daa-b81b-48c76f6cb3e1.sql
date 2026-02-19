-- Create upsert_gateway_alert function for tracking 5xx gateway errors
CREATE OR REPLACE FUNCTION public.upsert_gateway_alert(
  _model text,
  _error_message text,
  _node_id text,
  _node_label text,
  _workflow_id uuid,
  _status_code integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  existing_alert_id UUID;
  alert_title TEXT;
  alert_severity TEXT;
BEGIN
  -- Check for existing unresolved alert for this model + error type
  SELECT id INTO existing_alert_id
  FROM system_alerts
  WHERE affected_model = _model
    AND is_resolved = false
    AND alert_type = 'gateway_error'
    AND error_pattern = 'AI API error: ' || _status_code::text
  LIMIT 1;
  
  alert_title := CASE 
    WHEN _status_code = 503 THEN 'Service Unavailable: ' || _model
    WHEN _status_code = 502 THEN 'Bad Gateway: ' || _model
    WHEN _status_code = 504 THEN 'Gateway Timeout: ' || _model
    ELSE 'Gateway Error (' || _status_code || '): ' || _model
  END;
  
  -- 503s are transient, lower severity
  alert_severity := CASE 
    WHEN _status_code = 503 THEN 'warning'
    ELSE 'critical'
  END;
  
  IF existing_alert_id IS NOT NULL THEN
    -- Update existing alert (increment count, add node)
    UPDATE system_alerts
    SET 
      occurrence_count = occurrence_count + 1,
      last_seen_at = now(),
      affected_nodes = (
        SELECT jsonb_agg(DISTINCT node_elem)
        FROM (
          SELECT jsonb_array_elements(affected_nodes) AS node_elem
          UNION
          SELECT to_jsonb(_node_id)
        ) AS combined_nodes
      ),
      updated_at = now()
    WHERE id = existing_alert_id;
  ELSE
    -- Create new alert
    INSERT INTO system_alerts (
      alert_type, severity, title, description,
      affected_model, affected_nodes, error_pattern, action_url
    ) VALUES (
      'gateway_error',
      alert_severity,
      alert_title,
      'The model ' || _model || ' returned a ' || _status_code || ' error. ' || 
      CASE WHEN _status_code = 503 
        THEN 'This is usually transient - retry in a few moments.'
        ELSE 'Error: ' || LEFT(_error_message, 300)
      END,
      _model,
      jsonb_build_array(_node_id),
      'AI API error: ' || _status_code::text,
      '/workflow/' || _workflow_id::text
    );
  END IF;
END;
$$;