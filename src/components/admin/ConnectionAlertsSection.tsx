import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ConnectionAlert {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

interface ConnectionAlertsSectionProps {
  alerts: ConnectionAlert[];
  onResolve: (alertId: string) => void;
  isResolving?: boolean;
}

export function ConnectionAlertsSection({ alerts, onResolve, isResolving }: ConnectionAlertsSectionProps) {
  if (alerts.length === 0) return null;

  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Active Alerts ({alerts.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert) => (
          <div
            key={alert.id}
            className="flex items-start justify-between p-3 rounded-lg bg-background border border-destructive/20"
          >
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <Badge 
                  variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}
                  className="text-xs"
                >
                  {alert.severity}
                </Badge>
                <span className="text-sm font-medium">{alert.title}</span>
              </div>
              {alert.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  {alert.description}
                </p>
              )}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Occurrences: {alert.occurrence_count}</span>
                <span>
                  First seen: {formatDistanceToNow(new Date(alert.first_seen_at), { addSuffix: true })}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onResolve(alert.id)}
              disabled={isResolving}
              className="ml-2"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Resolve
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
