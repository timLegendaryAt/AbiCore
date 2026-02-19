-- Create table for health check history
CREATE TABLE public.integration_health_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id TEXT NOT NULL,
    status TEXT NOT NULL,
    response_time_ms INTEGER,
    status_code INTEGER,
    error_message TEXT,
    response_data JSONB,
    check_type TEXT NOT NULL DEFAULT 'scheduled',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient queries
CREATE INDEX idx_health_checks_integration_created 
  ON integration_health_checks(integration_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.integration_health_checks ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view health checks
CREATE POLICY "Authenticated users can view health checks"
  ON integration_health_checks FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Platform admins can manage health checks
CREATE POLICY "Platform admins can manage health checks"
  ON integration_health_checks FOR ALL
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

-- Create function for connection alert aggregation
CREATE OR REPLACE FUNCTION public.upsert_connection_alert(
  _integration_id TEXT,
  _error_message TEXT,
  _status_code INTEGER
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_alert_id UUID;
  platform_name TEXT;
  alert_title TEXT;
BEGIN
  platform_name := CASE 
    WHEN _integration_id = 'abi' THEN 'Abi Platform'
    WHEN _integration_id = 'abivc' THEN 'AbiVC Platform'
    ELSE _integration_id
  END;
  
  -- Check for existing unresolved alert
  SELECT id INTO existing_alert_id
  FROM system_alerts
  WHERE affected_model = _integration_id
    AND is_resolved = false
    AND alert_type = 'api_connection'
  LIMIT 1;
  
  alert_title := 'Connection Error: ' || platform_name;
  
  IF existing_alert_id IS NOT NULL THEN
    UPDATE system_alerts
    SET 
      occurrence_count = occurrence_count + 1,
      last_seen_at = now(),
      description = 'Health check failed. Error: ' || LEFT(_error_message, 500),
      updated_at = now()
    WHERE id = existing_alert_id;
  ELSE
    INSERT INTO system_alerts (
      alert_type, severity, title, description,
      affected_model, error_pattern
    ) VALUES (
      'api_connection',
      CASE WHEN _status_code = 0 THEN 'critical' ELSE 'warning' END,
      alert_title,
      'Health check failed for ' || platform_name || '. Error: ' || LEFT(_error_message, 500),
      _integration_id,
      'Connection error: ' || COALESCE(_status_code::text, 'timeout')
    );
  END IF;
END;
$$;