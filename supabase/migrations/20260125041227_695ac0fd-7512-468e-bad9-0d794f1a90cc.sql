-- Create system_alerts table for platform-wide alerts
CREATE TABLE public.system_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    title TEXT NOT NULL,
    description TEXT,
    affected_model TEXT,
    affected_nodes JSONB DEFAULT '[]',
    error_pattern TEXT,
    occurrence_count INTEGER DEFAULT 1,
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;

-- Platform admins can manage all system alerts
CREATE POLICY "Platform admins can manage system alerts"
  ON public.system_alerts FOR ALL
  USING (is_platform_admin(auth.uid()))
  WITH CHECK (is_platform_admin(auth.uid()));

-- All authenticated users can view alerts
CREATE POLICY "Authenticated users can view system alerts"
  ON public.system_alerts FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Create trigger for updated_at
CREATE TRIGGER update_system_alerts_updated_at
  BEFORE UPDATE ON public.system_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to upsert model alerts (called from edge functions)
CREATE OR REPLACE FUNCTION public.upsert_model_alert(
  _model TEXT,
  _error_message TEXT,
  _node_id TEXT,
  _status_code INTEGER
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_alert_id UUID;
  alert_title TEXT;
BEGIN
  -- Check for existing unresolved alert for this model
  SELECT id INTO existing_alert_id
  FROM system_alerts
  WHERE affected_model = _model
    AND is_resolved = false
    AND alert_type = 'model_unavailable'
  LIMIT 1;
  
  alert_title := CASE 
    WHEN _status_code = 404 THEN 'Model Not Found: ' || _model
    WHEN _status_code = 410 THEN 'Model Deprecated: ' || _model
    ELSE 'Model Error: ' || _model
  END;
  
  IF existing_alert_id IS NOT NULL THEN
    -- Update existing alert
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
      affected_model, affected_nodes, error_pattern
    ) VALUES (
      'model_unavailable',
      CASE WHEN _status_code IN (404, 410) THEN 'critical' ELSE 'warning' END,
      alert_title,
      'The model ' || _model || ' is returning errors. Error: ' || LEFT(_error_message, 500),
      _model,
      jsonb_build_array(_node_id),
      'AI API error: ' || _status_code::text
    );
  END IF;
END;
$$;