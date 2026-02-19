import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Shield, Database, Cpu, Sparkles, TrendingUp, TrendingDown, Minus, Settings, Loader2, Play } from 'lucide-react';
import { NodeBase } from '@/types/workflow';
import { 
  PerformanceMetricsSection, 
  PerformanceStats,
  ModelSwitchAnalysis,
  calculatePerformanceStats as calcPerfStats,
  calculateModelSwitchAnalysis as calcModelSwitch
} from './PerformanceMetricsSection';
import { checkPerformanceAlerts, DEFAULT_PERFORMANCE_THRESHOLDS } from '@/lib/performanceAlerts';
import { useToast } from '@/hooks/use-toast';

interface SelfImprovementSettings {
  enabled: boolean;
  alert_threshold: number;
  evaluation_limit: number;
  auto_tag_low_quality: boolean;
  summary_enabled: boolean;
  summary_days: number;
  summary_last_run: string | null;
  // Metric toggles
  metrics_hallucination_enabled: boolean;
  metrics_data_quality_enabled: boolean;
  metrics_complexity_enabled: boolean;
}

const DEFAULT_SETTINGS: SelfImprovementSettings = {
  enabled: true,
  alert_threshold: 50,
  evaluation_limit: 20,
  auto_tag_low_quality: true,
  summary_enabled: false,
  summary_days: 7,
  summary_last_run: null,
  metrics_hallucination_enabled: true,
  metrics_data_quality_enabled: true,
  metrics_complexity_enabled: true,
};

interface EvaluationRecord {
  id: string;
  company_id: string;
  company_name?: string;
  workflow_id: string;
  node_id: string;
  node_label: string | null;
  hallucination_score: number | null;
  hallucination_reasoning: string | null;
  data_quality_score: number | null;
  data_quality_reasoning: string | null;
  complexity_score: number | null;
  complexity_reasoning: string | null;
  overall_score: number | null;
  flags: string[] | null;
  evaluated_at: string;
}

interface AggregateStats {
  metric: string;
  avg_score: number | null;
  min_score: number | null;
  max_score: number | null;
  count: number;
}

interface MetricSummary {
  summary: string;
  generated_at: string;
  model: string;
  avg_score: number;
  trend: 'improving' | 'stable' | 'declining';
  evaluation_count: number;
}

interface NodeSummary {
  node_label: string;
  hallucination: MetricSummary;
  data_quality: MetricSummary;
  complexity: MetricSummary;
  last_updated: string;
}

interface NodeSummaries {
  [nodeKey: string]: NodeSummary;
}

// Legacy format for backward compatibility
interface LegacyImprovementSummaries {
  hallucination?: MetricSummary;
  data_quality?: MetricSummary;
  complexity?: MetricSummary;
}

interface WorkflowOption {
  id: string;
  name: string;
  nodes: NodeBase[];
  parent_id: string | null;
  sort_order: number;
}

interface WorkflowHierarchyItem {
  workflow: WorkflowOption;
  children: WorkflowHierarchyItem[];
  level: number;
}

interface NodeOption {
  id: string;
  label: string;
  type: string;
}

const getScoreColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined) return 'text-muted-foreground';
  if (score >= 70) return 'text-green-600';
  if (score >= 40) return 'text-yellow-600';
  return 'text-red-600';
};

const getProgressColor = (score: number | null | undefined): string => {
  if (score === null || score === undefined) return 'bg-muted';
  if (score >= 70) return 'bg-green-600';
  if (score >= 40) return 'bg-yellow-600';
  return 'bg-red-600';
};

const TrendIcon = ({ trend }: { trend?: 'improving' | 'stable' | 'declining' }) => {
  if (trend === 'improving') return <TrendingUp className="w-4 h-4 text-green-600" />;
  if (trend === 'declining') return <TrendingDown className="w-4 h-4 text-red-600" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
};

// Build workflow hierarchy from flat list
const buildWorkflowHierarchy = (workflows: WorkflowOption[]): WorkflowHierarchyItem[] => {
  const childrenMap = new Map<string | null, WorkflowOption[]>();
  
  workflows.forEach(workflow => {
    const parentId = workflow.parent_id || null;
    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }
    childrenMap.get(parentId)!.push(workflow);
  });

  // Sort each level by sort_order
  childrenMap.forEach(children => {
    children.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  });

  // Recursively build hierarchy
  const buildHierarchy = (parentId: string | null, level: number): WorkflowHierarchyItem[] => {
    const children = childrenMap.get(parentId) || [];
    return children.map(workflow => ({
      workflow,
      level,
      children: buildHierarchy(workflow.id, level + 1),
    }));
  };

  return buildHierarchy(null, 0);
};

// Flatten hierarchy for select dropdown
const flattenHierarchy = (items: WorkflowHierarchyItem[]): { workflow: WorkflowOption; level: number }[] => {
  const result: { workflow: WorkflowOption; level: number }[] = [];
  
  const traverse = (items: WorkflowHierarchyItem[]) => {
    items.forEach(item => {
      result.push({ workflow: item.workflow, level: item.level });
      traverse(item.children);
    });
  };
  
  traverse(items);
  return result;
};

export function CurrentDataTab() {
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [aggregates, setAggregates] = useState<AggregateStats[]>([]);
  const [nodeSummaries, setNodeSummaries] = useState<NodeSummaries>({});
  const [loading, setLoading] = useState(true);
  const [loadingEvaluations, setLoadingEvaluations] = useState(false);
  const [evaluationLimit, setEvaluationLimit] = useState(20);
  const [companiesMap, setCompaniesMap] = useState<Record<string, string>>({});

  // Workflow and node selection state
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [workflowNodes, setWorkflowNodes] = useState<NodeOption[]>([]);
  
  // Performance metrics state
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);
  const [modelAnalysis, setModelAnalysis] = useState<ModelSwitchAnalysis[]>([]);

  // Settings state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SelfImprovementSettings>(DEFAULT_SETTINGS);
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  // Get current node summary based on selection
  const currentNodeSummary = selectedWorkflowId && selectedNodeId
    ? nodeSummaries[`${selectedWorkflowId}:${selectedNodeId}`]
    : null;

  // Initial data fetch (workflows, companies, settings)
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);

      // Fetch settings from self_improvement_settings column directly
      const { data: settingsData } = await supabase
        .from('app_settings')
        .select('self_improvement_settings, improvement_summaries')
        .limit(1)
        .maybeSingle();

      // Load self-improvement settings from dedicated column
      if (settingsData?.self_improvement_settings) {
        const storedSettings = settingsData.self_improvement_settings as Record<string, any>;
        setSettings({ ...DEFAULT_SETTINGS, ...storedSettings });
        setEvaluationLimit((storedSettings.evaluation_limit as number) || 20);
      }

      // Load per-node AI summaries
      if (settingsData?.improvement_summaries) {
        // Check if it's new per-node format or legacy format
        const summariesData = settingsData.improvement_summaries as Record<string, any>;
        
        // New format has keys like "workflow_id:node_id" with node_label inside
        const isPerNodeFormat = Object.values(summariesData).some(
          (v: any) => v && typeof v === 'object' && 'node_label' in v
        );
        
        if (isPerNodeFormat) {
          setNodeSummaries(summariesData as NodeSummaries);
        }
        // Legacy format is ignored - will be replaced on next generation
      }

      // Fetch companies for name lookup
      const { data: companies } = await supabase
        .from('companies')
        .select('id, name');
      
      const companyMap: Record<string, string> = {};
      companies?.forEach(c => {
        companyMap[c.id] = c.name;
      });
      setCompaniesMap(companyMap);

      // Fetch workflows with nodes
      const { data: workflowsData } = await supabase
        .from('workflows')
        .select('id, name, nodes, parent_id, sort_order')
        .order('sort_order');

      if (workflowsData) {
        setWorkflows(workflowsData.map(w => ({
          id: w.id,
          name: w.name,
          nodes: (Array.isArray(w.nodes) ? w.nodes : []) as unknown as NodeBase[],
          parent_id: w.parent_id || null,
          sort_order: w.sort_order || 0,
        })));
      }

      setLoading(false);
    };

    fetchInitialData();
  }, []);

  // Handle workflow selection
  const handleWorkflowChange = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    setSelectedNodeId(null);
    setEvaluations([]);
    setAggregates([]);
    setPerformanceStats(null);
    setModelAnalysis([]);

    // Find the workflow and extract promptTemplate nodes
    const workflow = workflows.find(w => w.id === workflowId);
    if (workflow) {
      const nodes = workflow.nodes
        .filter(n => n.type === 'promptTemplate')
        .map(n => ({ id: n.id, label: n.label, type: n.type }));
      setWorkflowNodes(nodes);
    } else {
      setWorkflowNodes([]);
    }
  };

  // Handle node selection
  const handleNodeChange = async (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setLoadingEvaluations(true);

    // Get selected node label for alerts
    const selectedNode = workflowNodes.find(n => n.id === nodeId);
    const nodeLabel = selectedNode?.label || nodeId;

    // Fetch evaluations and usage logs in parallel
    const [evalsResult, usageResult] = await Promise.all([
      supabase
        .from('evaluation_history')
        .select('*')
        .eq('workflow_id', selectedWorkflowId)
        .eq('node_id', nodeId)
        .order('evaluated_at', { ascending: false })
        .limit(evaluationLimit),
      supabase
        .from('ai_usage_logs')
        .select('execution_time_ms, prompt_tokens, completion_tokens, total_tokens, estimated_cost, model, created_at, dependency_changed_at')
        .eq('workflow_id', selectedWorkflowId)
        .eq('node_id', nodeId)
        .order('created_at', { ascending: false })
        .limit(evaluationLimit)
    ]);

    // Process evaluations
    if (!evalsResult.error && evalsResult.data) {
      setEvaluations(evalsResult.data.map(e => ({
        ...e,
        company_name: companiesMap[e.company_id] || 'Unknown Company',
        flags: e.flags || [],
      })));

      // Calculate per-node aggregates locally
      calculateNodeAggregates(evalsResult.data);
    }

    // Process performance data
    if (!usageResult.error && usageResult.data && usageResult.data.length > 0) {
      const stats = calcPerfStats(usageResult.data);
      setPerformanceStats(stats);
      setModelAnalysis(calcModelSwitch(stats));

      // Check thresholds and generate alerts if exceeded
      if (selectedWorkflowId) {
        checkPerformanceAlerts(stats, selectedWorkflowId, nodeId, nodeLabel);
      }
    } else {
      setPerformanceStats(null);
      setModelAnalysis([]);
    }

    setLoadingEvaluations(false);
  };

  // Calculate per-node aggregates locally
  const calculateNodeAggregates = (evals: EvaluationRecord[]) => {
    if (evals.length === 0) {
      setAggregates([]);
      return;
    }

    const hallScores = evals.filter(e => e.hallucination_score != null).map(e => e.hallucination_score!);
    const dqScores = evals.filter(e => e.data_quality_score != null).map(e => e.data_quality_score!);
    const compScores = evals.filter(e => e.complexity_score != null).map(e => e.complexity_score!);

    const newAggregates: AggregateStats[] = [
      {
        metric: 'hallucination',
        avg_score: hallScores.length > 0 ? Math.round(hallScores.reduce((a, b) => a + b, 0) / hallScores.length * 10) / 10 : null,
        min_score: hallScores.length > 0 ? Math.min(...hallScores) : null,
        max_score: hallScores.length > 0 ? Math.max(...hallScores) : null,
        count: hallScores.length
      },
      {
        metric: 'data_quality',
        avg_score: dqScores.length > 0 ? Math.round(dqScores.reduce((a, b) => a + b, 0) / dqScores.length * 10) / 10 : null,
        min_score: dqScores.length > 0 ? Math.min(...dqScores) : null,
        max_score: dqScores.length > 0 ? Math.max(...dqScores) : null,
        count: dqScores.length
      },
      {
        metric: 'complexity',
        avg_score: compScores.length > 0 ? Math.round(compScores.reduce((a, b) => a + b, 0) / compScores.length * 10) / 10 : null,
        min_score: compScores.length > 0 ? Math.min(...compScores) : null,
        max_score: compScores.length > 0 ? Math.max(...compScores) : null,
        count: compScores.length
      }
    ];

    setAggregates(newAggregates);
  };

  const getAggregateByMetric = (metric: string): AggregateStats | undefined => {
    return aggregates.find(a => a.metric === metric);
  };

  // Settings handlers
  const handleSettingChange = async <K extends keyof SelfImprovementSettings>(
    key: K,
    value: SelfImprovementSettings[K]
  ) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    // Auto-save to self_improvement_settings column directly
    const { data: existing } = await supabase
      .from('app_settings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('app_settings')
        .update({ 
          self_improvement_settings: newSettings,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    }

    // Update evaluation limit if changed
    if (key === 'evaluation_limit') {
      setEvaluationLimit(value as number);
    }
  };

  const handleGenerateNow = async () => {
    setGenerating(true);
    try {
      const response = await supabase.functions.invoke('generate-improvement-summary');
      
      if (response.error) {
        throw new Error(response.error.message);
      }

      // Refresh per-node summaries
      const { data } = await supabase
        .from('app_settings')
        .select('improvement_summaries, self_improvement_settings')
        .limit(1)
        .maybeSingle();

      if (data) {
        if (data.improvement_summaries) {
          setNodeSummaries(data.improvement_summaries as unknown as NodeSummaries);
        }
        const selfSettings = data.self_improvement_settings as Record<string, any> | null;
        if (selfSettings?.summary_last_run) {
          setSettings(prev => ({
            ...prev,
            summary_last_run: selfSettings.summary_last_run as string
          }));
        }
      }

      toast({
        title: 'Summaries generated',
        description: `Analyzed ${response.data?.evaluations_analyzed || 0} evaluations across ${response.data?.nodes_processed || 0} nodes.`,
      });
    } catch (error) {
      toast({
        title: 'Generation failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const hallucinationStats = getAggregateByMetric('hallucination');
  const dataQualityStats = getAggregateByMetric('data_quality');
  const complexityStats = getAggregateByMetric('complexity');

  const overallAverage = aggregates.length > 0
    ? Math.round(
        ((hallucinationStats?.avg_score || 0) * 0.5 +
         (dataQualityStats?.avg_score || 0) * 0.3 +
         (complexityStats?.avg_score || 0) * 0.2)
      )
    : null;

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-64" />
        </div>
        <Skeleton className="h-96 rounded-lg" />
      </div>
    );
  }

  // Build hierarchy for workflow selection
  const workflowHierarchy = buildWorkflowHierarchy(workflows);
  const flattenedWorkflows = flattenHierarchy(workflowHierarchy);

  return (
    <div className="space-y-6">
      {/* Selection Section with Settings Icon */}
      <div className="flex items-center gap-4">
        <div className="flex-1 max-w-xs">
          <label className="text-sm text-muted-foreground mb-1 block">Workflow</label>
          <Select value={selectedWorkflowId || ''} onValueChange={handleWorkflowChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select a workflow" />
            </SelectTrigger>
            <SelectContent>
              {flattenedWorkflows.map(({ workflow, level }) => (
                <SelectItem 
                  key={workflow.id} 
                  value={workflow.id}
                  className="cursor-pointer"
                >
                  <span style={{ paddingLeft: `${level * 16}px` }}>
                    {workflow.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 max-w-xs">
          <label className="text-sm text-muted-foreground mb-1 block">Node</label>
          <Select
            value={selectedNodeId || ''}
            onValueChange={handleNodeChange}
            disabled={!selectedWorkflowId || workflowNodes.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={
                !selectedWorkflowId 
                  ? "Select workflow first" 
                  : workflowNodes.length === 0 
                    ? "No generative nodes" 
                    : "Select a node"
              } />
            </SelectTrigger>
            <SelectContent>
              {workflowNodes.map(n => (
                <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Settings icon - top right */}
        <div className="ml-auto self-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={cn(
              "h-9 w-9",
              settingsOpen && "bg-accent"
            )}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Settings Panel (slides down) */}
      <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
        <CollapsibleContent>
          <Card className="border-dashed">
            <CardContent className="pt-4 space-y-4">
              {/* Row 1: Thresholds */}
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <Label htmlFor="alert_threshold" className="text-sm whitespace-nowrap">
                    Alert Threshold
                  </Label>
                  <Input
                    id="alert_threshold"
                    type="number"
                    min={0}
                    max={100}
                    value={settings.alert_threshold}
                    onChange={(e) => handleSettingChange('alert_threshold', parseInt(e.target.value) || 50)}
                    className="w-20 h-8"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <Label htmlFor="evaluation_limit" className="text-sm whitespace-nowrap">
                    History Limit
                  </Label>
                  <Input
                    id="evaluation_limit"
                    type="number"
                    min={5}
                    max={100}
                    value={settings.evaluation_limit}
                    onChange={(e) => handleSettingChange('evaluation_limit', parseInt(e.target.value) || 20)}
                    className="w-20 h-8"
                  />
                </div>
              </div>

              <Separator />

              {/* Row 2: Toggles and Summary Agent */}
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <Switch
                    id="auto_tag"
                    checked={settings.auto_tag_low_quality}
                    onCheckedChange={(checked) => handleSettingChange('auto_tag_low_quality', checked)}
                  />
                  <Label htmlFor="auto_tag" className="text-sm">Auto-tag Low Quality</Label>
                </div>

                <Separator orientation="vertical" className="h-6" />

                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-muted-foreground" />
                  <Switch
                    id="summary_enabled"
                    checked={settings.summary_enabled}
                    onCheckedChange={(checked) => handleSettingChange('summary_enabled', checked)}
                  />
                  <Label htmlFor="summary_enabled" className="text-sm">Summaries</Label>
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor="summary_days" className="text-sm whitespace-nowrap">Every</Label>
                  <Input
                    id="summary_days"
                    type="number"
                    min={1}
                    max={30}
                    value={settings.summary_days}
                    onChange={(e) => handleSettingChange('summary_days', parseInt(e.target.value) || 7)}
                    disabled={!settings.summary_enabled}
                    className="w-16 h-8"
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerateNow}
                  disabled={generating}
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </Button>

                {settings.summary_last_run && (
                  <span className="text-xs text-muted-foreground">
                    Last: {format(new Date(settings.summary_last_run), 'MMM d, HH:mm')}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* Placeholder when no node selected */}
      {!selectedNodeId && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Cpu className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Select a workflow and node above to view evaluation data</p>
          </CardContent>
        </Card>
      )}

      {/* Loading state for evaluations */}
      {loadingEvaluations && selectedNodeId && (
        <div className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Skeleton key={i} className="h-32 rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-lg" />
        </div>
      )}

      {/* Show data when node is selected and not loading */}
      {selectedNodeId && !loadingEvaluations && (
        <>
          {/* Aggregate Score Cards with Summaries */}
          <div className="grid grid-cols-4 gap-4">
            {/* Overall Score */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  Overall Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-3xl font-bold", getScoreColor(overallAverage))}>
                    {overallAverage ?? '—'}%
                  </span>
                </div>
                <Progress 
                  value={overallAverage || 0} 
                  className="h-2 mt-2"
                  indicatorClassName={getProgressColor(overallAverage)}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Based on {evaluations.length} evaluations
                </p>
              </CardContent>
            </Card>

            {/* Hallucination */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Hallucination
                  </span>
                  <TrendIcon trend={currentNodeSummary?.hallucination?.trend} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-3xl font-bold", getScoreColor(hallucinationStats?.avg_score))}>
                    {hallucinationStats?.avg_score ?? '—'}%
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Data Quality */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Data Quality
                  </span>
                  <TrendIcon trend={currentNodeSummary?.data_quality?.trend} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-3xl font-bold", getScoreColor(dataQualityStats?.avg_score))}>
                    {dataQualityStats?.avg_score ?? '—'}%
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Complexity */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Cpu className="w-4 h-4" />
                    Complexity
                  </span>
                  <TrendIcon trend={currentNodeSummary?.complexity?.trend} />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-3xl font-bold", getScoreColor(complexityStats?.avg_score))}>
                    {complexityStats?.avg_score ?? '—'}%
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance Metrics Section */}
          <PerformanceMetricsSection 
            performanceStats={performanceStats}
            modelAnalysis={modelAnalysis}
          />

          {/* AI Summary Section (shows per-node summaries for selected node) */}
          {currentNodeSummary && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  AI-Generated Improvement Summaries for "{currentNodeSummary.node_label}"
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {currentNodeSummary.hallucination?.summary && (
                  <Alert>
                    <Shield className="w-4 h-4" />
                    <AlertDescription>
                      <span className="font-medium">Hallucination: </span>
                      {currentNodeSummary.hallucination.summary}
                    </AlertDescription>
                  </Alert>
                )}
                {currentNodeSummary.data_quality?.summary && (
                  <Alert>
                    <Database className="w-4 h-4" />
                    <AlertDescription>
                      <span className="font-medium">Data Quality: </span>
                      {currentNodeSummary.data_quality.summary}
                    </AlertDescription>
                  </Alert>
                )}
                {currentNodeSummary.complexity?.summary && (
                  <Alert>
                    <Cpu className="w-4 h-4" />
                    <AlertDescription>
                      <span className="font-medium">Complexity: </span>
                      {currentNodeSummary.complexity.summary}
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-xs text-muted-foreground text-right">
                  Last updated: {currentNodeSummary.last_updated 
                    ? format(new Date(currentNodeSummary.last_updated), 'MMM d, yyyy HH:mm')
                    : 'Never'}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Three Column Score Grid */}
          {evaluations.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              {/* Hallucination Column */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Hallucination
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3 p-4 pt-0">
                      {evaluations.map((evaluation, index) => (
                        <div key={evaluation.id} className="border-b pb-3 last:border-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">#{index + 1}</span>
                            <span className={cn("text-sm font-bold", getScoreColor(evaluation.hallucination_score))}>
                              {evaluation.hallucination_score ?? '—'}%
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mb-1 truncate">
                            {evaluation.company_name} — {format(new Date(evaluation.evaluated_at), 'MMM d, HH:mm')}
                          </div>
                          <Progress 
                            value={evaluation.hallucination_score || 0} 
                            className="h-1 mb-2"
                            indicatorClassName={getProgressColor(evaluation.hallucination_score)}
                          />
                          {evaluation.hallucination_reasoning && (
                            <p className="text-xs text-muted-foreground line-clamp-3">
                              {evaluation.hallucination_reasoning}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Data Quality Column */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Database className="w-4 h-4" />
                    Data Quality
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3 p-4 pt-0">
                      {evaluations.map((evaluation, index) => (
                        <div key={evaluation.id} className="border-b pb-3 last:border-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">#{index + 1}</span>
                            <span className={cn("text-sm font-bold", getScoreColor(evaluation.data_quality_score))}>
                              {evaluation.data_quality_score ?? '—'}%
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mb-1 truncate">
                            {evaluation.company_name} — {format(new Date(evaluation.evaluated_at), 'MMM d, HH:mm')}
                          </div>
                          <Progress 
                            value={evaluation.data_quality_score || 0} 
                            className="h-1 mb-2"
                            indicatorClassName={getProgressColor(evaluation.data_quality_score)}
                          />
                          {evaluation.data_quality_reasoning && (
                            <p className="text-xs text-muted-foreground line-clamp-3">
                              {evaluation.data_quality_reasoning}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Complexity Column */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Cpu className="w-4 h-4" />
                    Complexity
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3 p-4 pt-0">
                      {evaluations.map((evaluation, index) => (
                        <div key={evaluation.id} className="border-b pb-3 last:border-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground">#{index + 1}</span>
                            <span className={cn("text-sm font-bold", getScoreColor(evaluation.complexity_score))}>
                              {evaluation.complexity_score ?? '—'}%
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground mb-1 truncate">
                            {evaluation.company_name} — {format(new Date(evaluation.evaluated_at), 'MMM d, HH:mm')}
                          </div>
                          <Progress 
                            value={evaluation.complexity_score || 0} 
                            className="h-1 mb-2"
                            indicatorClassName={getProgressColor(evaluation.complexity_score)}
                          />
                          {evaluation.complexity_reasoning && (
                            <p className="text-xs text-muted-foreground line-clamp-3">
                              {evaluation.complexity_reasoning}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}

          {/* No evaluations message */}
          {evaluations.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>No evaluations found for this node</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
