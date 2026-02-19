import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Play, 
  Pause, 
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';

interface ExecutionSummaryAlert {
  id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning' | 'critical';
  affected_nodes: Array<{
    type: string;
    node_id?: string;
    node_label?: string;
    workflow_id?: string;
    workflow_name?: string;
    message: string;
  }>;
  occurrence_count: number;
  last_seen_at: string;
  affected_model: string; // company_id
}

interface SummaryStats {
  workflowsTriggered: number;
  totalWorkflows: number;
  nodesExecuted: number;
  nodesCached: number;
  nodesPaused: number;
  emptyOutputs: number;
  issuesDetected: number;
  lastRun: string | null;
  companyName: string | null;
}

function StatCard({ 
  title, 
  value, 
  subValue, 
  icon: Icon, 
  color,
  onClick 
}: { 
  title: string; 
  value: string | number; 
  subValue?: string;
  icon: React.ElementType; 
  color: string;
  onClick?: () => void;
}) {
  return (
    <Card 
      className={`cursor-pointer transition-colors hover:bg-muted/50 ${onClick ? '' : 'cursor-default'}`}
      onClick={onClick}
    >
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className="text-xl font-bold">{value}</p>
            {subValue && <p className="text-xs text-muted-foreground">{subValue}</p>}
          </div>
          <div className={`p-2 rounded-full ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ExecutionSummaryCards() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [summaryAlert, setSummaryAlert] = useState<ExecutionSummaryAlert | null>(null);
  const [stats, setStats] = useState<SummaryStats>({
    workflowsTriggered: 0,
    totalWorkflows: 0,
    nodesExecuted: 0,
    nodesCached: 0,
    nodesPaused: 0,
    emptyOutputs: 0,
    issuesDetected: 0,
    lastRun: null,
    companyName: null,
  });
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    const fetchLatestSummary = async () => {
      // Fetch the most recent execution summary alert
      const { data: alerts } = await supabase
        .from('system_alerts')
        .select('*')
        .eq('alert_type', 'execution_summary')
        .eq('is_resolved', false)
        .order('last_seen_at', { ascending: false })
        .limit(1);

      if (alerts && alerts.length > 0) {
        const alert = alerts[0];
        const issues = Array.isArray(alert.affected_nodes) 
          ? (alert.affected_nodes as ExecutionSummaryAlert['affected_nodes']) 
          : [];
        
        setSummaryAlert({
          id: alert.id,
          title: alert.title,
          description: alert.description || '',
          severity: (alert.severity as 'info' | 'warning' | 'critical') || 'info',
          affected_nodes: issues,
          occurrence_count: alert.occurrence_count,
          last_seen_at: alert.last_seen_at,
          affected_model: alert.affected_model || '',
        });

        // Parse stats from description (format: "X/Y workflows ran. Z nodes executed, W cached, P paused, E empty outputs")
        const desc = alert.description || '';
        const workflowMatch = desc.match(/(\d+)\/(\d+) workflows ran/);
        const nodesMatch = desc.match(/(\d+) nodes executed/);
        const cachedMatch = desc.match(/(\d+) cached/);
        const pausedMatch = desc.match(/(\d+) paused/);
        const emptyMatch = desc.match(/(\d+) empty outputs/);
        
        // Extract company name from title (format: "Execution Summary: Company Name")
        const companyMatch = alert.title.match(/Execution Summary: (.+)/);
        
        setStats({
          workflowsTriggered: workflowMatch ? parseInt(workflowMatch[1]) : 0,
          totalWorkflows: workflowMatch ? parseInt(workflowMatch[2]) : 0,
          nodesExecuted: nodesMatch ? parseInt(nodesMatch[1]) : 0,
          nodesCached: cachedMatch ? parseInt(cachedMatch[1]) : 0,
          nodesPaused: pausedMatch ? parseInt(pausedMatch[1]) : 0,
          emptyOutputs: emptyMatch ? parseInt(emptyMatch[1]) : 0,
          issuesDetected: issues.length,
          lastRun: alert.last_seen_at,
          companyName: companyMatch ? companyMatch[1] : null,
        });
      }
      
      setLoading(false);
    };

    fetchLatestSummary();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-4">
              <Skeleton className="h-14" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Don't show if no summary exists
  if (!summaryAlert) {
    return null;
  }

  const severityColors = {
    info: 'bg-blue-500/10 text-blue-500',
    warning: 'bg-yellow-500/10 text-yellow-500',
    critical: 'bg-destructive/10 text-destructive',
  };

  const groupedIssues = summaryAlert.affected_nodes.reduce((acc, issue) => {
    const type = issue.type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(issue);
    return acc;
  }, {} as Record<string, typeof summaryAlert.affected_nodes>);

  return (
    <>
      <Card className="mb-4">
        <CardContent className="pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h3 className="font-medium text-sm">Last Execution Summary</h3>
              {stats.companyName && (
                <Badge variant="outline" className="text-xs">{stats.companyName}</Badge>
              )}
              <Badge 
                variant={summaryAlert.severity === 'critical' ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                {summaryAlert.severity}
              </Badge>
            </div>
            {stats.lastRun && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatDistanceToNow(new Date(stats.lastRun), { addSuffix: true })}
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              title="Workflows Triggered"
              value={`${stats.workflowsTriggered}/${stats.totalWorkflows}`}
              icon={Play}
              color={stats.workflowsTriggered === stats.totalWorkflows 
                ? 'bg-green-500/10 text-green-500' 
                : 'bg-yellow-500/10 text-yellow-500'}
            />
            <StatCard
              title="Nodes Executed"
              value={stats.nodesExecuted}
              subValue={`${stats.nodesCached} cached`}
              icon={CheckCircle2}
              color="bg-blue-500/10 text-blue-500"
            />
            <StatCard
              title="Paused/Skipped"
              value={stats.nodesPaused}
              icon={Pause}
              color={stats.nodesPaused > 0 
                ? 'bg-amber-500/10 text-amber-500' 
                : 'bg-muted text-muted-foreground'}
            />
            <StatCard
              title="Issues Detected"
              value={stats.issuesDetected}
              subValue={stats.emptyOutputs > 0 ? `${stats.emptyOutputs} empty outputs` : undefined}
              icon={AlertCircle}
              color={stats.issuesDetected > 0 
                ? severityColors[summaryAlert.severity]
                : 'bg-green-500/10 text-green-500'}
              onClick={stats.issuesDetected > 0 ? () => setDetailOpen(true) : undefined}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Execution Issues
              <Badge variant={summaryAlert.severity === 'critical' ? 'destructive' : 'secondary'}>
                {summaryAlert.affected_nodes.length} issues
              </Badge>
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {Object.entries(groupedIssues).map(([type, issues]) => (
              <div key={type} className="space-y-2">
                <h4 className="font-medium text-sm capitalize">
                  {type.replace(/_/g, ' ')} ({issues.length})
                </h4>
                <div className="space-y-1">
                  {issues.map((issue, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between p-2 bg-muted/50 rounded text-sm"
                    >
                      <span>{issue.message}</span>
                      {issue.workflow_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            navigate(`/workflow/${issue.workflow_id}`);
                            setDetailOpen(false);
                          }}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          View
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {Object.keys(groupedIssues).length === 0 && (
              <p className="text-muted-foreground text-center py-4">No issues recorded</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
