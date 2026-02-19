CREATE OR REPLACE FUNCTION public.upsert_performance_alert(
    _workflow_id UUID,
    _node_id TEXT,
    _node_label TEXT,
    _alert_type TEXT,
    _value NUMERIC,
    _threshold NUMERIC,
    _description TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    existing_alert_id UUID;
    alert_title TEXT;
    alert_severity TEXT;
    percent_over NUMERIC;
BEGIN
    percent_over := ROUND(((_value - _threshold) / _threshold) * 100);
    
    alert_title := CASE _alert_type
        WHEN 'slow_speed' THEN 'Slow Generation: ' || COALESCE(_node_label, _node_id)
        WHEN 'high_cost' THEN 'High Cost: ' || COALESCE(_node_label, _node_id)
        WHEN 'high_tokens' THEN 'High Token Usage: ' || COALESCE(_node_label, _node_id)
        ELSE 'Performance Issue: ' || COALESCE(_node_label, _node_id)
    END;
    
    alert_severity := CASE
        WHEN percent_over > 100 THEN 'critical'
        WHEN percent_over > 50 THEN 'warning'
        ELSE 'info'
    END;
    
    -- Check for existing unresolved alert
    SELECT id INTO existing_alert_id
    FROM system_alerts
    WHERE affected_model = _workflow_id::text || ':' || _node_id || ':' || _alert_type
      AND is_resolved = false
      AND alert_type = 'performance_' || _alert_type
    LIMIT 1;
    
    IF existing_alert_id IS NOT NULL THEN
        UPDATE system_alerts
        SET 
            occurrence_count = occurrence_count + 1,
            last_seen_at = now(),
            description = _description,
            severity = alert_severity,
            updated_at = now()
        WHERE id = existing_alert_id;
    ELSE
        INSERT INTO system_alerts (
            alert_type, severity, title, description,
            affected_model, affected_nodes, error_pattern
        ) VALUES (
            'performance_' || _alert_type,
            alert_severity,
            alert_title,
            _description,
            _workflow_id::text || ':' || _node_id || ':' || _alert_type,
            jsonb_build_array(_node_id),
            'Performance threshold exceeded by ' || percent_over || '%'
        );
    END IF;
END;
$$;