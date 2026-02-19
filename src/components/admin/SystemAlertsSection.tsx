import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Bell, 
  AlertTriangle, 
  XCircle, 
  Check, 
  Clock,
  Cpu,
  ExternalLink
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface SystemAlert {
  id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string | null;
  affected_model: string | null;
  affected_nodes: string[];
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  is_resolved: boolean;
  action_url: string | null;
}

interface AlertCardProps {
  alert: SystemAlert;
  onResolve: (alertId: string) => void;
  isResolving: boolean;
}

function AlertCard({ alert, onResolve, isResolving }: AlertCardProps) {
  const navigate = useNavigate();
  
  const severityConfig = {
    critical: {
      border: 'border-destructive',
      bg: 'bg-destructive/10',
      icon: XCircle,
      iconClass: 'text-destructive',
      badge: 'destructive' as const,
    },
    warning: {
      border: 'border-yellow-500',
      bg: 'bg-yellow-500/10',
      icon: AlertTriangle,
      iconClass: 'text-yellow-500',
      badge: 'secondary' as const,
    },
    info: {
      border: 'border-blue-500',
      bg: 'bg-blue-500/10',
      icon: Bell,
      iconClass: 'text-blue-500',
      badge: 'outline' as const,
    },
  };

  // Hide execution_summary alerts from here (they're shown in ExecutionSummaryCards)
  if (alert.alert_type === 'execution_summary') {
    return null;
  }

  const config = severityConfig[alert.severity] || severityConfig.warning;
  const Icon = config.icon;
  const uniqueNodes = [...new Set(alert.affected_nodes)];

  return (
    <div className={`border rounded-lg p-4 ${config.border} ${config.bg}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <Icon className={`w-5 h-5 mt-0.5 ${config.iconClass}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={config.badge} className="uppercase text-xs">
                {alert.severity}
              </Badge>
              <h4 className="font-semibold">{alert.title}</h4>
            </div>
            {alert.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {alert.description}
              </p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                First seen: {formatDistanceToNow(new Date(alert.first_seen_at), { addSuffix: true })}
              </span>
              <span>|</span>
              <span>Occurrences: {alert.occurrence_count}</span>
              {uniqueNodes.length > 0 && (
                <>
                  <span>|</span>
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3 h-3" />
                    {uniqueNodes.length} node{uniqueNodes.length !== 1 ? 's' : ''} affected
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {alert.action_url && (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                navigate(alert.action_url!);
                // Auto-resolve info alerts when navigating to action
                if (alert.severity === 'info') {
                  onResolve(alert.id);
                }
              }}
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              Review
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => onResolve(alert.id)}
            disabled={isResolving}
          >
            <Check className="w-4 h-4 mr-1" />
            Resolve
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SystemAlertsSection() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchAlerts = async () => {
    const { data, error } = await supabase
      .from('system_alerts')
      .select('*')
      .eq('is_resolved', false)
      .order('severity', { ascending: true }) // critical first (alphabetically 'critical' < 'warning')
      .order('last_seen_at', { ascending: false });

    if (error) {
      console.error('Error fetching system alerts:', error);
      return;
    }

    // Sort by severity properly (critical > warning > info)
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const sorted = (data || []).sort((a, b) => {
      const aOrder = severityOrder[a.severity as keyof typeof severityOrder] ?? 2;
      const bOrder = severityOrder[b.severity as keyof typeof severityOrder] ?? 2;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
    });

    setAlerts(sorted.map(a => ({
      id: a.id,
      alert_type: a.alert_type,
      severity: (a.severity as 'info' | 'warning' | 'critical') || 'warning',
      title: a.title,
      description: a.description,
      affected_model: a.affected_model,
      affected_nodes: Array.isArray(a.affected_nodes) 
        ? (a.affected_nodes as string[]) 
        : [],
      occurrence_count: a.occurrence_count,
      first_seen_at: a.first_seen_at,
      last_seen_at: a.last_seen_at,
      is_resolved: a.is_resolved,
      action_url: a.action_url || null,
    })));
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchAlerts();
      setLoading(false);
    };
    load();
  }, []);

  const handleResolve = async (alertId: string) => {
    setResolvingId(alertId);
    
    const { data: userData } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from('system_alerts')
      .update({ 
        is_resolved: true, 
        resolved_at: new Date().toISOString(),
        resolved_by: userData.user?.id || null,
      })
      .eq('id', alertId);

    if (error) {
      console.error('Error resolving alert:', error);
    } else {
      await fetchAlerts();
    }
    
    setResolvingId(null);
  };

  if (loading) {
    return null; // Don't show loading state for alerts section
  }

  // Filter out execution_summary alerts (shown in ExecutionSummaryCards)
  const displayAlerts = alerts.filter(a => a.alert_type !== 'execution_summary');

  if (displayAlerts.length === 0) {
    return null; // Don't show section if no active alerts
  }

  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Bell className="w-5 h-5" />
          System Alerts ({displayAlerts.length} active)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {displayAlerts.map(alert => (
          <AlertCard 
            key={alert.id} 
            alert={alert} 
            onResolve={handleResolve}
            isResolving={resolvingId === alert.id}
          />
        ))}
      </CardContent>
    </Card>
  );
}
