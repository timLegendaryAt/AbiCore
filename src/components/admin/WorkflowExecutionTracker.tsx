import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from '@/components/ui/collapsible';
import { 
  RefreshCw, 
  Play, 
  Clock, 
  ChevronDown, 
  ChevronUp,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Square
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore } from '@/store/workflowStore';
import { toast } from 'sonner';

interface ProgressData {
  current: number;
  total: number;
  current_node_label: string | null;
  current_workflow_name: string | null;
  completed_nodes: number;
  failed_at_node: string | null;
}

interface RunningWorkflow {
  id: string;
  company_id: string;
  company_name: string;
  workflow_id: string | null;
  workflow_name: string | null;
  node_label: string | null;
  status: 'pending' | 'processing';
  source_type: string;
  trigger_type: string | null;
  started_at: string;
  progress: ProgressData | null;
  error_message: string | null;
}

export function WorkflowExecutionTracker() {
  const [workflows, setWorkflows] = useState<RunningWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const navigate = useNavigate();

  const fetchRunningWorkflows = async () => {
    const { data: fetchedSubmissions, error: subError } = await supabase
      .from('company_data_submissions')
      .select('id, company_id, status, source_type, raw_data, metadata, error_message, created_at, updated_at')
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false });

    if (subError) {
      console.error('Error fetching running workflows:', subError);
      return;
    }

    if (!fetchedSubmissions || fetchedSubmissions.length === 0) {
      setWorkflows([]);
      return;
    }

    // Auto-mark stale submissions (>10 min) as failed
    const STALE_THRESHOLD_MS = 10 * 60 * 1000;
    const now = Date.now();
    const staleIds = fetchedSubmissions
      .filter(s => now - new Date(s.updated_at).getTime() > STALE_THRESHOLD_MS)
      .map(s => s.id);

    if (staleIds.length > 0) {
      console.log(`[WorkflowTracker] Marking ${staleIds.length} stale submissions as failed`);
      supabase
        .from('company_data_submissions')
        .update({
          status: 'failed',
          error_message: 'Marked as failed: stuck in processing for over 10 minutes',
        })
        .in('id', staleIds)
        .then(({ error }) => {
          if (error) console.error('Error marking stale submissions:', error);
        });
    }

    const activeSubmissions = fetchedSubmissions.filter(s => !staleIds.includes(s.id));

    if (activeSubmissions.length === 0) {
      setWorkflows([]);
      return;
    }

    // Get unique company IDs and workflow IDs
    const companyIds = [...new Set(activeSubmissions.map(s => s.company_id))];
    const workflowIds = activeSubmissions
      .map(s => {
        const rawData = s.raw_data as Record<string, unknown> | null;
        return rawData?.workflow_id as string | undefined;
      })
      .filter((id): id is string => !!id);

    const [companiesResult, workflowsResult] = await Promise.all([
      supabase.from('companies').select('id, name').in('id', companyIds),
      workflowIds.length > 0 
        ? supabase.from('workflows').select('id, name').in('id', workflowIds)
        : Promise.resolve({ data: [] }),
    ]);

    const companyMap = new Map(
      (companiesResult.data || []).map(c => [c.id, c.name])
    );
    const workflowMap = new Map(
      (workflowsResult.data || []).map(w => [w.id, w.name])
    );

    const running: RunningWorkflow[] = activeSubmissions.map(s => {
      const rawData = s.raw_data as Record<string, unknown> | null;
      const metadata = s.metadata as Record<string, unknown> | null;
      const workflowId = rawData?.workflow_id as string | null;
      const trigger = rawData?._trigger as string | null;
      const nodeLabel = rawData?.node_label as string | null;
      const progress = metadata?.progress as ProgressData | null;

      return {
        id: s.id,
        company_id: s.company_id,
        company_name: companyMap.get(s.company_id) || 'Unknown Company',
        workflow_id: workflowId,
        workflow_name: workflowId ? workflowMap.get(workflowId) || null : null,
        node_label: nodeLabel,
        status: s.status as 'pending' | 'processing',
        source_type: s.source_type,
        trigger_type: trigger,
        started_at: s.status === 'processing' ? s.updated_at : s.created_at,
        progress,
        error_message: s.error_message,
      };
    });

    running.sort((a, b) => {
      if (a.status === 'processing' && b.status !== 'processing') return -1;
      if (a.status !== 'processing' && b.status === 'processing') return 1;
      return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
    });

    setWorkflows(running);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchRunningWorkflows();
      setLoading(false);
    };
    load();

    const interval = setInterval(fetchRunningWorkflows, 10000);

    const channel = supabase
      .channel('workflow-tracker')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_data_submissions',
        },
        () => {
          fetchRunningWorkflows();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchRunningWorkflows();
    setRefreshing(false);
  };

  const runningCount = workflows.filter(w => w.status === 'processing').length;
  const queuedCount = workflows.filter(w => w.status === 'pending').length;

  const handleStop = async (submissionId: string) => {
    // Signal cancellation to the in-browser orchestration loop
    useWorkflowStore.getState().cancelCascade(submissionId);
    // Fallback: directly update DB for runs from other tabs
    const { error } = await supabase.from('company_data_submissions')
      .update({ status: 'failed', error_message: 'Cancelled by user' })
      .eq('id', submissionId);
    if (error) {
      toast.error('Failed to stop workflow');
    } else {
      toast.success('Workflow stopped');
      await fetchRunningWorkflows();
    }
  };

  const getSourceLabel = (sourceType: string, triggerType: string | null) => {
    if (triggerType === 'force_run' || triggerType === 'canvas_force_run') return 'Force Run';
    if (triggerType === 'node_force_run') return 'Node Force Run';
    if (triggerType === 'system_workflows') return 'System Workflows';
    if (sourceType === 'manual') return 'Manual';
    if (sourceType === 'api') return 'API';
    return sourceType;
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="p-0 h-auto">
                  {isOpen ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CardTitle className="text-lg">Workflow Execution Status</CardTitle>
              <div className="flex items-center gap-2">
                <Badge 
                  variant={runningCount > 0 ? 'default' : 'secondary'}
                  className={runningCount > 0 ? 'bg-blue-500 hover:bg-blue-600' : ''}
                >
                  <span className={runningCount > 0 ? 'animate-pulse mr-1' : 'mr-1'}>●</span>
                  Running ({runningCount})
                </Badge>
                <Badge variant="outline">
                  <Clock className="w-3 h-3 mr-1" />
                  Queued ({queuedCount})
                </Badge>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh} 
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        
        <CollapsibleContent>
          <CardContent className="pt-0">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            ) : workflows.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <CheckCircle2 className="w-5 h-5 mr-2 opacity-50" />
                <span>No workflows currently running</span>
              </div>
            ) : (
              <div className="space-y-3">
                {workflows.map(workflow => (
                  <WorkflowCard 
                    key={workflow.id} 
                    workflow={workflow} 
                    onNavigate={(id) => navigate(`/workflow/${id}`)}
                    onStop={handleStop}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function WorkflowCard({ 
  workflow, 
  onNavigate,
  onStop,
}: { 
  workflow: RunningWorkflow; 
  onNavigate: (id: string) => void;
  onStop: (submissionId: string) => void;
}) {
  const progress = workflow.progress;
  const progressPercent = progress && progress.total > 0 
    ? Math.round((progress.completed_nodes / progress.total) * 100) 
    : 0;

  const getSourceLabel = (sourceType: string, triggerType: string | null) => {
    if (triggerType === 'force_run' || triggerType === 'canvas_force_run') return 'Force Run';
    if (triggerType === 'node_force_run') return 'Node Force Run';
    if (triggerType === 'system_workflows') return 'System Workflows';
    if (sourceType === 'manual') return 'Manual';
    if (sourceType === 'api') return 'API';
    return sourceType;
  };

  return (
    <div className="flex flex-col gap-2 p-4 rounded-lg border bg-card">
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1">
          <div className="flex items-center gap-2">
            {workflow.status === 'processing' ? (
              <Play className="w-4 h-4 text-blue-500 fill-blue-500" />
            ) : (
              <Clock className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="font-medium">{workflow.company_name}</span>
            <Badge 
              variant={workflow.status === 'processing' ? 'default' : 'secondary'}
              className={workflow.status === 'processing' ? 'bg-blue-500/10 text-blue-600 border-blue-200' : ''}
            >
              {workflow.status === 'processing' ? 'Running' : 'Queued'}
            </Badge>
          </div>
          
          {/* Current execution info */}
          <div className="text-sm text-muted-foreground">
            {progress?.failed_at_node ? (
              <span className="flex items-center gap-1 text-destructive">
                <AlertCircle className="w-3.5 h-3.5" />
                Failed at: {progress.current_workflow_name ? `${progress.current_workflow_name} > ` : ''}{progress.failed_at_node}
              </span>
            ) : progress?.current_node_label ? (
              <span>
                {progress.current_workflow_name ? `${progress.current_workflow_name} > ` : ''}
                {progress.current_node_label}
              </span>
            ) : workflow.workflow_name ? (
              <span>Workflow: {workflow.workflow_name}</span>
            ) : workflow.node_label ? (
              <span>Node: {workflow.node_label}</span>
            ) : (
              <span>Processing submission...</span>
            )}
          </div>
          
          <div className="text-xs text-muted-foreground">
            Started {formatDistanceToNow(new Date(workflow.started_at), { addSuffix: true })}
            {' • '}
            Source: {getSourceLabel(workflow.source_type, workflow.trigger_type)}
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onStop(workflow.id)}
            className="text-destructive hover:text-destructive"
          >
            <Square className="w-3.5 h-3.5 mr-1 fill-current" />
            Stop
          </Button>
          {workflow.workflow_id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate(workflow.workflow_id!)}
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              View
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {progress && progress.total > 0 && (
        <div className="space-y-1">
          <Progress 
            value={progressPercent} 
            className="h-2"
            indicatorClassName={progress.failed_at_node ? 'bg-destructive' : 'bg-blue-500'}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progress.completed_nodes} / {progress.total} nodes</span>
            <span>{progressPercent}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
