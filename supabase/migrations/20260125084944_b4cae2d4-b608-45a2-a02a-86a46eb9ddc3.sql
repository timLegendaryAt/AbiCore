-- Add action_url column to system_alerts for navigation links
ALTER TABLE system_alerts 
ADD COLUMN IF NOT EXISTS action_url TEXT;

-- Create RPC function to upsert verification alerts
CREATE OR REPLACE FUNCTION public.upsert_verification_alert(
  _matches_count integer,
  _discrepancies_count integer,
  _new_models_count integer,
  _deprecated_count integer,
  _has_pending_changes boolean
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
BEGIN
  -- Check for existing unresolved verification alert
  SELECT id INTO existing_alert_id
  FROM system_alerts
  WHERE alert_type = 'model_verification'
    AND is_resolved = false
  LIMIT 1;
  
  -- Determine severity based on findings
  alert_severity := CASE
    WHEN _deprecated_count > 0 THEN 'warning'
    WHEN _discrepancies_count > 0 OR _new_models_count > 0 THEN 'info'
    ELSE 'info'
  END;
  
  alert_title := CASE
    WHEN _discrepancies_count > 0 OR _new_models_count > 0 THEN
      'Model Verification: Changes Detected'
    ELSE
      'Model Verification Complete'
  END;
  
  alert_desc := _matches_count || ' models verified. ';
  IF _discrepancies_count > 0 THEN
    alert_desc := alert_desc || _discrepancies_count || ' changes found. ';
  END IF;
  IF _new_models_count > 0 THEN
    alert_desc := alert_desc || _new_models_count || ' new models available. ';
  END IF;
  IF _deprecated_count > 0 THEN
    alert_desc := alert_desc || _deprecated_count || ' deprecated. ';
  END IF;
  
  IF existing_alert_id IS NOT NULL THEN
    UPDATE system_alerts
    SET 
      occurrence_count = occurrence_count + 1,
      last_seen_at = now(),
      title = alert_title,
      description = alert_desc,
      severity = alert_severity,
      action_url = CASE WHEN _has_pending_changes 
        THEN '/admin?tab=agents-models' 
        ELSE NULL 
      END,
      updated_at = now()
    WHERE id = existing_alert_id;
  ELSE
    INSERT INTO system_alerts (
      alert_type, severity, title, description,
      affected_model, action_url
    ) VALUES (
      'model_verification',
      alert_severity,
      alert_title,
      alert_desc,
      'model_registry',
      CASE WHEN _has_pending_changes 
        THEN '/admin?tab=agents-models' 
        ELSE NULL 
      END
    );
  END IF;
END;
$$;