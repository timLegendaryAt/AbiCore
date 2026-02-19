import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface HealthCheck {
  id: string;
  integration_id: string;
  status: string;
  response_time_ms: number | null;
  status_code: number | null;
  error_message: string | null;
  check_type: string;
  created_at: string;
}

interface ConnectionAlert {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

interface UseIntegrationHealthResult {
  latestHealth: HealthCheck | null;
  alerts: ConnectionAlert[];
  isLoading: boolean;
  refreshHealth: () => Promise<void>;
  resolveAlert: (alertId: string) => Promise<void>;
}

export function useIntegrationHealth(integrationId: 'abi' | 'abivc'): UseIntegrationHealthResult {
  const [latestHealth, setLatestHealth] = useState<HealthCheck | null>(null);
  const [alerts, setAlerts] = useState<ConnectionAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadLatestHealth = useCallback(async () => {
    const { data } = await supabase
      .from('integration_health_checks')
      .select('*')
      .eq('integration_id', integrationId)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data?.[0]) {
      setLatestHealth(data[0] as HealthCheck);
    }
  }, [integrationId]);

  const loadAlerts = useCallback(async () => {
    const { data } = await supabase
      .from('system_alerts')
      .select('id, title, description, severity, occurrence_count, first_seen_at, last_seen_at')
      .eq('affected_model', integrationId)
      .eq('alert_type', 'api_connection')
      .eq('is_resolved', false);

    setAlerts((data || []) as ConnectionAlert[]);
  }, [integrationId]);

  const refreshHealth = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([loadLatestHealth(), loadAlerts()]);
    setIsLoading(false);
  }, [loadLatestHealth, loadAlerts]);

  const resolveAlert = useCallback(async (alertId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    
    await supabase
      .from('system_alerts')
      .update({
        is_resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: user?.id,
      })
      .eq('id', alertId);

    await loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    refreshHealth();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      loadLatestHealth();
      loadAlerts();
    }, 30000);

    return () => clearInterval(interval);
  }, [refreshHealth, loadLatestHealth, loadAlerts]);

  return {
    latestHealth,
    alerts,
    isLoading,
    refreshHealth,
    resolveAlert,
  };
}
