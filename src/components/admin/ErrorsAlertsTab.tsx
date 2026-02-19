import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  AlertCircle, 
  XCircle, 
  AlertTriangle, 
  FileX,
  RefreshCw,
  Layers
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { SystemAlertsSection } from './SystemAlertsSection';
import { ExecutionSummaryCards } from './ExecutionSummaryCards';
import { WorkflowExecutionTracker } from './WorkflowExecutionTracker';

type ErrorSource = 'execution_run' | 'execution_step' | 'submission' | 'job';

interface ErrorRecord {
  id: string;
  source: ErrorSource;
  created_at: string;
  error_message: string | null;
  workflow_id: string | null;
  workflow_name: string | null;
  company_id: string | null;
  company_name: string | null;
  node_id: string | null;
  node_label: string | null;
}

interface SummaryCardProps {
  title: string;
  count: number;
  icon: React.ElementType;
  color: string;
}

function SummaryCard({ title, count, icon: Icon, color }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{count}</p>
          </div>
          <div className={`p-3 rounded-full ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SourceBadge({ source }: { source: ErrorSource }) {
  const config: Record<ErrorSource, { label: string; variant: 'destructive' | 'secondary' | 'outline' | 'default' }> = {
    execution_run: { label: 'Execution Run', variant: 'destructive' },
    execution_step: { label: 'Node Step', variant: 'default' },
    submission: { label: 'Submission', variant: 'secondary' },
    job: { label: 'Job', variant: 'outline' },
  };
  
  const { label, variant } = config[source];
  return <Badge variant={variant}>{label}</Badge>;
}

export function ErrorsAlertsTab() {
  const [errors, setErrors] = useState<ErrorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [expandedError, setExpandedError] = useState<ErrorRecord | null>(null);
  
  // Summary counts
  const [runCount, setRunCount] = useState(0);
  const [stepCount, setStepCount] = useState(0);
  const [submissionCount, setSubmissionCount] = useState(0);
  const [jobCount, setJobCount] = useState(0);

  const fetchErrors = async () => {
    // Fetch from all sources in parallel
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoISO = sevenDaysAgo.toISOString();

    const [runsResult, stepsResult, submissionsResult, jobsResult, workflowsResult, companiesResult] = await Promise.all([
      supabase
        .from('execution_runs')
        .select('id, created_at, error_message, workflow_id, company_id')
        .eq('status', 'failed')
        .gte('created_at', sevenDaysAgoISO)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('execution_steps')
        .select('id, created_at, error_message, node_id, node_label, execution_run_id')
        .eq('status', 'failed')
        .gte('created_at', sevenDaysAgoISO)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('company_data_submissions')
        .select('id, created_at, error_message, company_id')
        .eq('status', 'failed')
        .gte('created_at', sevenDaysAgoISO)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('job_queue')
        .select('id, created_at, error_message, workflow_id, company_id')
        .eq('status', 'failed')
        .gte('created_at', sevenDaysAgoISO)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.from('workflows').select('id, name'),
      supabase.from('companies').select('id, name'),
    ]);

    // Build lookup maps
    const workflowMap = new Map<string, string>();
    (workflowsResult.data || []).forEach(w => workflowMap.set(w.id, w.name));
    
    const companyMap = new Map<string, string>();
    (companiesResult.data || []).forEach(c => companyMap.set(c.id, c.name));

    // Normalize and combine
    const normalizedRuns: ErrorRecord[] = (runsResult.data || []).map(r => ({
      id: `run-${r.id}`,
      source: 'execution_run' as ErrorSource,
      created_at: r.created_at,
      error_message: r.error_message,
      workflow_id: r.workflow_id,
      workflow_name: r.workflow_id ? workflowMap.get(r.workflow_id) || null : null,
      company_id: r.company_id,
      company_name: r.company_id ? companyMap.get(r.company_id) || null : null,
      node_id: null,
      node_label: null,
    }));

    const normalizedSteps: ErrorRecord[] = (stepsResult.data || []).map(s => ({
      id: `step-${s.id}`,
      source: 'execution_step' as ErrorSource,
      created_at: s.created_at,
      error_message: s.error_message,
      workflow_id: null,
      workflow_name: null,
      company_id: null,
      company_name: null,
      node_id: s.node_id,
      node_label: s.node_label,
    }));

    const normalizedSubmissions: ErrorRecord[] = (submissionsResult.data || []).map(s => ({
      id: `sub-${s.id}`,
      source: 'submission' as ErrorSource,
      created_at: s.created_at,
      error_message: s.error_message,
      workflow_id: null,
      workflow_name: null,
      company_id: s.company_id,
      company_name: s.company_id ? companyMap.get(s.company_id) || null : null,
      node_id: null,
      node_label: null,
    }));

    const normalizedJobs: ErrorRecord[] = (jobsResult.data || []).map(j => ({
      id: `job-${j.id}`,
      source: 'job' as ErrorSource,
      created_at: j.created_at,
      error_message: j.error_message,
      workflow_id: j.workflow_id,
      workflow_name: j.workflow_id ? workflowMap.get(j.workflow_id) || null : null,
      company_id: j.company_id,
      company_name: j.company_id ? companyMap.get(j.company_id) || null : null,
      node_id: null,
      node_label: null,
    }));

    // Set counts
    setRunCount(normalizedRuns.length);
    setStepCount(normalizedSteps.length);
    setSubmissionCount(normalizedSubmissions.length);
    setJobCount(normalizedJobs.length);

    // Combine and sort by date
    const allErrors = [
      ...normalizedRuns,
      ...normalizedSteps,
      ...normalizedSubmissions,
      ...normalizedJobs,
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setErrors(allErrors);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchErrors();
      setLoading(false);
    };
    load();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchErrors();
    setRefreshing(false);
  };

  const filteredErrors = sourceFilter === 'all' 
    ? errors 
    : errors.filter(e => e.source === sourceFilter);

  const totalCount = runCount + stepCount + submissionCount + jobCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold mb-2">Errors & Alerts</h2>
        <p className="text-muted-foreground">
          Monitor system errors, failed executions, and alerts (last 7 days)
        </p>
      </div>

      {/* Workflow Execution Tracker */}
      <WorkflowExecutionTracker />

      {/* Execution Summary Cards */}
      <ExecutionSummaryCards />

      {/* System Alerts Section */}
      <SystemAlertsSection />

      {/* Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <SummaryCard 
            title="Total Errors" 
            count={totalCount} 
            icon={AlertCircle} 
            color="bg-destructive/10 text-destructive" 
          />
          <SummaryCard 
            title="Failed Runs" 
            count={runCount} 
            icon={XCircle} 
            color="bg-red-500/10 text-red-500" 
          />
          <SummaryCard 
            title="Failed Steps" 
            count={stepCount} 
            icon={Layers} 
            color="bg-orange-500/10 text-orange-500" 
          />
          <SummaryCard 
            title="Failed Submissions" 
            count={submissionCount} 
            icon={FileX} 
            color="bg-yellow-500/10 text-yellow-500" 
          />
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-center">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="execution_run">Execution Runs</SelectItem>
                <SelectItem value="execution_step">Node Steps</SelectItem>
                <SelectItem value="submission">Submissions</SelectItem>
                <SelectItem value="job">Jobs</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Error Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Errors</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : filteredErrors.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No errors found in the last 7 days</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Workflow / Node</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredErrors.map(error => (
                  <TableRow 
                    key={error.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedError(error)}
                  >
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDistanceToNow(new Date(error.created_at), { addSuffix: true })}
                    </TableCell>
                    <TableCell>
                      <SourceBadge source={error.source} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {error.workflow_name || error.node_label || '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {error.company_name || '-'}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                      {error.error_message || 'No error message'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Error Detail Dialog */}
      <Dialog open={!!expandedError} onOpenChange={() => setExpandedError(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Error Details
              {expandedError && <SourceBadge source={expandedError.source} />}
            </DialogTitle>
          </DialogHeader>
          {expandedError && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Time</p>
                  <p>{new Date(expandedError.created_at).toLocaleString()}</p>
                </div>
                {expandedError.workflow_name && (
                  <div>
                    <p className="text-muted-foreground">Workflow</p>
                    <p>{expandedError.workflow_name}</p>
                  </div>
                )}
                {expandedError.node_label && (
                  <div>
                    <p className="text-muted-foreground">Node</p>
                    <p>{expandedError.node_label}</p>
                  </div>
                )}
                {expandedError.company_name && (
                  <div>
                    <p className="text-muted-foreground">Company</p>
                    <p>{expandedError.company_name}</p>
                  </div>
                )}
              </div>
              <div>
                <p className="text-muted-foreground text-sm mb-2">Error Message</p>
                <pre className="bg-muted p-4 rounded text-sm overflow-auto max-h-96 whitespace-pre-wrap">
                  {expandedError.error_message || 'No error message available'}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
