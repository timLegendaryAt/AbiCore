import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bell, 
  AlertTriangle, 
  XCircle, 
  Check, 
  Clock,
  ExternalLink,
  Info,
  CheckCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  approveSSOTChange, 
  rejectSSOTChange, 
  fetchPendingChange, 
  extractPendingChangeId 
} from '@/lib/ssotApproval';
import { SSOTPendingChange } from '@/types/ssot-changes';

interface SystemAlert {
  id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string | null;
  first_seen_at: string;
  last_seen_at: string;
  occurrence_count: number;
  action_url: string | null;
}

interface NotificationPanelProps {
  onClose: () => void;
}

export function NotificationPanel({ onClose }: NotificationPanelProps) {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchAlerts = async () => {
    const { data, error } = await supabase
      .from('system_alerts')
      .select('id, alert_type, severity, title, description, first_seen_at, last_seen_at, occurrence_count, action_url')
      .eq('is_resolved', false)
      .order('last_seen_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error fetching alerts:', error);
      return;
    }

    // Sort by severity (critical > warning > info)
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const sorted = (data || []).sort((a, b) => {
      const aOrder = severityOrder[a.severity as keyof typeof severityOrder] ?? 2;
      const bOrder = severityOrder[b.severity as keyof typeof severityOrder] ?? 2;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
    });

    setAlerts(sorted as SystemAlert[]);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchAlerts();
      setLoading(false);
    };
    load();
  }, []);

  const isSSOTPendingAlert = (alertType: string) => {
    return alertType === 'ssot_change_pending' || alertType === 'ssot_structure_pending';
  };

  const handleApprove = async (alert: SystemAlert, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const pendingChangeId = extractPendingChangeId(alert.action_url);
    if (!pendingChangeId) {
      console.error('No pending change ID found in action_url');
      return;
    }

    setProcessingId(alert.id);
    
    const change = await fetchPendingChange(pendingChangeId);
    if (change) {
      const success = await approveSSOTChange(change);
      if (success) {
        await fetchAlerts();
      }
    }
    
    setProcessingId(null);
  };

  const handleDeny = async (alert: SystemAlert, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const pendingChangeId = extractPendingChangeId(alert.action_url);
    if (!pendingChangeId) {
      console.error('No pending change ID found in action_url');
      return;
    }

    setProcessingId(alert.id);
    
    const change = await fetchPendingChange(pendingChangeId);
    if (change) {
      const success = await rejectSSOTChange(change);
      if (success) {
        await fetchAlerts();
      }
    }
    
    setProcessingId(null);
  };

  const handleResolve = async (alertId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProcessingId(alertId);
    
    const { data: userData } = await supabase.auth.getUser();
    
    await supabase
      .from('system_alerts')
      .update({ 
        is_resolved: true, 
        resolved_at: new Date().toISOString(),
        resolved_by: userData.user?.id || null,
      })
      .eq('id', alertId);

    await fetchAlerts();
    setProcessingId(null);
  };

  const handleView = (alert: SystemAlert) => {
    if (alert.action_url) {
      navigate(alert.action_url);
      onClose();
    }
  };

  const handleViewAll = () => {
    navigate('/admin?tab=errors');
    onClose();
  };

  const getSeverityConfig = (severity: string) => {
    switch (severity) {
      case 'critical':
        return {
          icon: XCircle,
          iconClass: 'text-destructive',
          bgClass: 'bg-destructive/10 border-destructive/30',
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          iconClass: 'text-yellow-500',
          bgClass: 'bg-yellow-500/10 border-yellow-500/30',
        };
      default:
        return {
          icon: Info,
          iconClass: 'text-blue-500',
          bgClass: 'bg-blue-500/10 border-blue-500/30',
        };
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {alerts.length > 0 ? `${alerts.length} active` : 'No alerts'}
          </span>
        </div>
        <Button variant="link" size="sm" className="p-0 h-auto" onClick={handleViewAll}>
          View All
          <ExternalLink className="ml-1 h-3 w-3" />
        </Button>
      </div>

      {/* Alert List */}
      <ScrollArea className="flex-1 -mx-6 px-6">
        {loading ? (
          <div className="py-8 text-center text-muted-foreground">
            Loading...
          </div>
        ) : alerts.length === 0 ? (
          <div className="py-12 text-center">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground font-medium">No new notifications</p>
            <p className="text-sm text-muted-foreground/70 mt-1">You're all caught up!</p>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            {alerts.map((alert) => {
              const config = getSeverityConfig(alert.severity);
              const Icon = config.icon;
              const isSSOT = isSSOTPendingAlert(alert.alert_type);
              const isProcessing = processingId === alert.id;
              
              return (
                <div
                  key={alert.id}
                  className={cn(
                    "p-3 rounded-lg border transition-colors",
                    isSSOT 
                      ? "bg-amber-500/10 border-amber-500/30 cursor-default" 
                      : cn(config.bgClass, "cursor-pointer hover:bg-accent/50")
                  )}
                  onClick={() => !isSSOT && handleView(alert)}
                >
                  <div className="flex items-start gap-3">
                    <Icon className={cn(
                      "h-4 w-4 mt-0.5 flex-shrink-0", 
                      isSSOT ? "text-amber-500" : config.iconClass
                    )} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-medium leading-tight line-clamp-1">
                          {alert.title}
                        </h4>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                          {isSSOT ? 'approval' : alert.severity}
                        </Badge>
                      </div>
                      {alert.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {alert.description}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-2">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(alert.last_seen_at), { addSuffix: true })}
                          {alert.occurrence_count > 1 && (
                            <span className="ml-1">• {alert.occurrence_count}x</span>
                          )}
                        </span>
                      </div>
                      
                      {/* SSOT Approval Actions */}
                      {isSSOT ? (
                        <div className="mt-3 flex gap-2">
                          <Button
                            size="sm"
                            className="h-6 px-2 text-xs bg-green-600 hover:bg-green-700"
                            onClick={(e) => handleApprove(alert, e)}
                            disabled={isProcessing}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Approve
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={(e) => handleDeny(alert, e)}
                            disabled={isProcessing}
                          >
                            <XCircle className="h-3 w-3 mr-1" />
                            Deny
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleView(alert);
                            }}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Review
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={(e) => handleResolve(alert.id, e)}
                            disabled={isProcessing}
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Resolve
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
