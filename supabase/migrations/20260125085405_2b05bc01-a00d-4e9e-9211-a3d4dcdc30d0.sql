-- Create RPC function for model mismatch alerts
CREATE OR REPLACE FUNCTION public.upsert_model_mismatch_alert(
  _workflow_id uuid,
  _node_id text,
  _node_label text,
  _configured_model text,
  _executed_model text
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
BEGIN
  -- Check for existing unresolved mismatch alert for this node
  SELECT id INTO existing_alert_id
  FROM system_alerts
  WHERE affected_model = _workflow_id::text || ':' || _node_id || ':mismatch'
    AND is_resolved = false
    AND alert_type = 'model_mismatch'
  LIMIT 1;
  
  alert_title := 'Model Mismatch: ' || COALESCE(_node_label, _node_id);
  alert_desc := 'Configured: ' || _configured_model || ' but executed with: ' || _executed_model;
  
  IF existing_alert_id IS NOT NULL THEN
    UPDATE system_alerts
    SET 
      occurrence_count = occurrence_count + 1,
      last_seen_at = now(),
      description = alert_desc,
      updated_at = now()
    WHERE id = existing_alert_id;
  ELSE
    INSERT INTO system_alerts (
      alert_type, severity, title, description,
      affected_model, affected_nodes, action_url
    ) VALUES (
      'model_mismatch',
      'warning',
      alert_title,
      alert_desc,
      _workflow_id::text || ':' || _node_id || ':mismatch',
      jsonb_build_array(_node_id),
      '/workflow/' || _workflow_id::text
    );
  END IF;
END;
$$;