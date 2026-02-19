import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWorkflowStore } from '@/store/workflowStore';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, Database, ChevronDown, Sparkles, TrendingUp, TrendingDown, Minus, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

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
  hallucination?: MetricSummary;
  data_quality?: MetricSummary;
  complexity?: MetricSummary;
  last_updated?: string;
}

interface NodeSummaries {
  [nodeKey: string]: NodeSummary;  // Key: "workflowId:nodeId"
}

export function ImprovementPanel() {
  const { selectedNodeIds, getImprovementDataForNode, workflow } = useWorkflowStore();
  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
  const [nodeSummaries, setNodeSummaries] = useState<NodeSummaries>({});
  const [reasoningOpen, setReasoningOpen] = useState(false);
  
  // Load AI summaries
  useEffect(() => {
    const loadSummaries = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('improvement_summaries')
        .limit(1)
        .maybeSingle();
      
      if (data?.improvement_summaries) {
        setNodeSummaries(data.improvement_summaries as unknown as NodeSummaries);
      }
    };
    loadSummaries();
  }, []);
  
  // Derive current node's summary based on workflow.id and selectedNodeId
  const currentNodeSummary = selectedNodeId && workflow.id
    ? nodeSummaries[`${workflow.id}:${selectedNodeId}`]
    : null;
  
  // Check if selected node is a Generative node
  const selectedNode = workflow.nodes.find(n => n.id === selectedNodeId);
  const isGenerativeNode = selectedNode?.type === 'promptTemplate';
  
  if (!selectedNodeId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Lightbulb className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-foreground mb-2">No node selected</h3>
        <p className="text-sm text-muted-foreground">
          Select a Generative node to view quality analysis
        </p>
      </div>
    );
  }
  
  if (!isGenerativeNode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <AlertTriangle className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-foreground mb-2">Not a Generative node</h3>
        <p className="text-sm text-muted-foreground">
          Quality analysis is only available for Generative nodes
        </p>
      </div>
    );
  }
  
  const nodeData = getImprovementDataForNode(selectedNodeId);
  
  if (!nodeData || nodeData.overallScore === undefined) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Database className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-foreground mb-2">No evaluations yet</h3>
        <p className="text-sm text-muted-foreground">
          Run the workflow to generate quality evaluations for this node
        </p>
      </div>
    );
  }

  // Score interpretation (higher is better - 100% = good)
  const getScoreColor = (score: number): string => {
    if (score >= 70) return 'text-green-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getProgressColor = (score: number): string => {
    if (score >= 70) return 'bg-green-600';
    if (score >= 40) return 'bg-yellow-600';
    return 'bg-red-600';
  };
  
  const getScoreLabel = (score: number): string => {
    if (score >= 70) return 'Excellent';
    if (score >= 40) return 'Moderate';
    return 'Needs Attention';
  };

  const TrendIcon = ({ trend }: { trend?: 'improving' | 'stable' | 'declining' }) => {
    if (trend === 'improving') return <TrendingUp className="w-3 h-3 text-green-600" />;
    if (trend === 'declining') return <TrendingDown className="w-3 h-3 text-red-600" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };
  
  return (
    <Tabs defaultValue="hallucination" className="flex flex-col h-full">
      {/* Tabs at very top */}
      <TabsList className="grid w-full grid-cols-3 rounded-none border-b bg-transparent h-10">
        <TabsTrigger value="hallucination" className="text-xs rounded-none data-[state=active]:bg-muted">
          Hallucination
        </TabsTrigger>
        <TabsTrigger value="quality" className="text-xs rounded-none data-[state=active]:bg-muted">
          Data Quality
        </TabsTrigger>
        <TabsTrigger value="complexity" className="text-xs rounded-none data-[state=active]:bg-muted">
          Complexity
        </TabsTrigger>
      </TabsList>
      
      {/* Tab Content with padding */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Hallucination Tab */}
        <TabsContent value="hallucination" className="mt-0 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Hallucination Score</span>
              {currentNodeSummary?.hallucination?.trend && (
                <TrendIcon trend={currentNodeSummary.hallucination.trend} />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("font-bold", getScoreColor(nodeData.hallucinationScore || 0))}>
                {nodeData.hallucinationScore ?? 0}%
              </span>
              <span className="text-xs text-muted-foreground">
                {getScoreLabel(nodeData.hallucinationScore || 0)}
              </span>
            </div>
          </div>
          <Progress 
            value={nodeData.hallucinationScore || 0} 
            className="h-2"
            indicatorClassName={getProgressColor(nodeData.hallucinationScore || 0)}
          />
          <p className="text-xs text-muted-foreground">
            100% = fully grounded in data, 0% = completely fabricated
          </p>
          
          {/* AI Summary */}
          {currentNodeSummary?.hallucination?.summary && (
            <Alert className="bg-muted/50 border-primary/20">
              <Sparkles className="w-4 h-4 text-primary" />
              <AlertDescription className="text-sm">
                {currentNodeSummary.hallucination.summary}
              </AlertDescription>
            </Alert>
          )}
          
          {/* Collapsible Latest Reasoning */}
          {nodeData.hallucinationReasoning && (
            <Collapsible open={reasoningOpen} onOpenChange={setReasoningOpen}>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ChevronDown className={cn("w-4 h-4 transition-transform", reasoningOpen && "rotate-180")} />
                Latest Reasoning
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Alert className="mt-2">
                  <AlertDescription className="text-sm">
                    {nodeData.hallucinationReasoning}
                  </AlertDescription>
                </Alert>
              </CollapsibleContent>
            </Collapsible>
          )}
        </TabsContent>
        
        {/* Data Quality Tab */}
        <TabsContent value="quality" className="mt-0 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Data Sufficiency Score</span>
              {currentNodeSummary?.data_quality?.trend && (
                <TrendIcon trend={currentNodeSummary.data_quality.trend} />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("font-bold", getScoreColor(nodeData.dataQualityScore || 0))}>
                {nodeData.dataQualityScore ?? 0}%
              </span>
              <span className="text-xs text-muted-foreground">
                {getScoreLabel(nodeData.dataQualityScore || 0)}
              </span>
            </div>
          </div>
          <Progress 
            value={nodeData.dataQualityScore || 0} 
            className="h-2"
            indicatorClassName={getProgressColor(nodeData.dataQualityScore || 0)}
          />
          <p className="text-xs text-muted-foreground">
            100% = all required data present, 0% = critical data missing
          </p>
          
          {/* AI Summary */}
          {currentNodeSummary?.data_quality?.summary && (
            <Alert className="bg-muted/50 border-primary/20">
              <Sparkles className="w-4 h-4 text-primary" />
              <AlertDescription className="text-sm">
                {currentNodeSummary.data_quality.summary}
              </AlertDescription>
            </Alert>
          )}
          
          {/* Collapsible Latest Reasoning */}
          {nodeData.dataQualityReasoning && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ChevronDown className="w-4 h-4" />
                Latest Reasoning
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Alert className="mt-2">
                  <AlertDescription className="text-sm">
                    {nodeData.dataQualityReasoning}
                  </AlertDescription>
                </Alert>
              </CollapsibleContent>
            </Collapsible>
          )}
        </TabsContent>
        
        {/* Complexity Tab */}
        <TabsContent value="complexity" className="mt-0 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Prompt Complexity Score</span>
              {currentNodeSummary?.complexity?.trend && (
                <TrendIcon trend={currentNodeSummary.complexity.trend} />
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("font-bold", getScoreColor(nodeData.complexityScore || 0))}>
                {nodeData.complexityScore ?? 0}%
              </span>
              <span className="text-xs text-muted-foreground">
                {getScoreLabel(nodeData.complexityScore || 0)}
              </span>
            </div>
          </div>
          <Progress 
            value={nodeData.complexityScore || 0} 
            className="h-2"
            indicatorClassName={getProgressColor(nodeData.complexityScore || 0)}
          />
          <p className="text-xs text-muted-foreground">
            100% = simple & manageable, 0% = too complex for reliable output
          </p>
          
          {/* AI Summary */}
          {currentNodeSummary?.complexity?.summary && (
            <Alert className="bg-muted/50 border-primary/20">
              <Sparkles className="w-4 h-4 text-primary" />
              <AlertDescription className="text-sm">
                {currentNodeSummary.complexity.summary}
              </AlertDescription>
            </Alert>
          )}
          
          {/* Collapsible Latest Reasoning */}
          {nodeData.complexityReasoning && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ChevronDown className="w-4 h-4" />
                Latest Reasoning
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Alert className="mt-2">
                  <AlertDescription className="text-sm">
                    {nodeData.complexityReasoning}
                  </AlertDescription>
                </Alert>
              </CollapsibleContent>
            </Collapsible>
          )}
        </TabsContent>
        
        {/* Footer with evaluation info */}
        <div className="pt-4 border-t mt-4 space-y-1">
          {nodeData.evaluatedAt && (
            <p className="text-xs text-muted-foreground text-center">
              Last evaluated: {new Date(nodeData.evaluatedAt).toLocaleString()}
            </p>
          )}
          {currentNodeSummary?.last_updated && (
            <p className="text-xs text-muted-foreground text-center">
              Summaries updated: {new Date(currentNodeSummary.last_updated).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </Tabs>
  );
}
