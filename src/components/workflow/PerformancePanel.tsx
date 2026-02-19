import { useState, useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Zap, 
  Clock, 
  DollarSign,
  Cpu,
  ArrowRightLeft,
  Database,
  Activity
} from 'lucide-react';
import { MODEL_REGISTRY, getModelById, formatTokenCount, formatCost } from '@/lib/modelRegistry';
import { getEffectiveModel } from '@/hooks/useModelPricing';
import { cn } from '@/lib/utils';

interface EffectiveModelInfo {
  id: string;
  displayName: string;
  provider: 'google' | 'openai' | 'perplexity';
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  capabilities: {
    webSearch: boolean;
    multimodal: boolean;
    reasoning: 'basic' | 'standard' | 'advanced';
  };
  recommended: boolean;
  hasOverride: boolean;
}

export function PerformancePanel() {
  const { selectedNodeIds, getPerformanceDataForNode, workflow } = useWorkflowStore();
  const selectedNodeId = selectedNodeIds.length === 1 ? selectedNodeIds[0] : null;
  
  // Check if selected node is a Generative node
  const selectedNode = workflow.nodes.find(n => n.id === selectedNodeId);
  const isGenerativeNode = selectedNode?.type === 'promptTemplate';
  const nodeData = selectedNodeId ? getPerformanceDataForNode(selectedNodeId) : null;
  const configuredModel = selectedNode?.config?.model;
  
  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  const [modelInfo, setModelInfo] = useState<EffectiveModelInfo | null>(null);
  
  useEffect(() => {
    if (configuredModel) {
      getEffectiveModel(configuredModel).then(model => {
        setModelInfo(model);
      });
    } else {
      setModelInfo(null);
    }
  }, [configuredModel]);
  
  // Now we can have early returns after all hooks are called
  if (!selectedNodeId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Zap className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-foreground mb-2">No node selected</h3>
        <p className="text-sm text-muted-foreground">
          Select a node to view performance metrics
        </p>
      </div>
    );
  }
  
  if (!isGenerativeNode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Cpu className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-foreground mb-2">Not a Generative node</h3>
        <p className="text-sm text-muted-foreground">
          Performance metrics are only available for Generative nodes. Other node types show overlay status based on connected dependencies.
        </p>
      </div>
    );
  }
  
  if (!nodeData || nodeData.totalGenerations === undefined || nodeData.totalGenerations === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Database className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-foreground mb-2">No execution data yet</h3>
        <p className="text-sm text-muted-foreground">
          Run this node to generate performance metrics. Data will appear here after executions.
        </p>
        {configuredModel && (
          <p className="text-xs text-muted-foreground mt-4">
            Configured model: {modelInfo?.displayName || configuredModel}
          </p>
        )}
      </div>
    );
  }
  
  const getScoreIcon = (score: number) => {
    if (score >= 70) return <CheckCircle2 className="w-5 h-5 text-green-600" />;
    if (score >= 40) return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
    return <XCircle className="w-5 h-5 text-red-600" />;
  };
  
  const getScoreColor = (score: number): string => {
    if (score >= 70) return 'bg-green-600';
    if (score >= 40) return 'bg-yellow-600';
    return 'bg-red-600';
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 70) return 'Healthy';
    if (score >= 40) return 'Warning';
    return 'Problem';
  };

  // Calculate what threshold % would be with different models
  const modelComparisons = MODEL_REGISTRY.filter(m => m.id !== configuredModel).slice(0, 3).map(model => ({
    id: model.id,
    name: model.displayName,
    thresholdPercent: nodeData.avgOutputTokens 
      ? Math.round((nodeData.avgOutputTokens / model.maxOutputTokens) * 100)
      : 0,
    wouldHitMax: nodeData.maxOutputTokensSeen 
      ? nodeData.maxOutputTokensSeen >= model.maxOutputTokens
      : false,
  }));

  return (
    <div className="space-y-4 p-4">
      {/* Quick Summary */}
      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Quick Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{nodeData.totalGenerations || 0}</div>
              <div className="text-xs text-muted-foreground">Total Generations</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{formatCost(nodeData.totalCost || 0)}</div>
              <div className="text-xs text-muted-foreground">Total Cost</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration vs Execution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" />
            Configuration vs Execution
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Configured:</span>
            <span className="font-medium">{modelInfo?.displayName || configuredModel || 'None'}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Last Used:</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">
                {getModelById(nodeData.lastExecutedModel || '')?.displayName || nodeData.lastExecutedModel || 'Unknown'}
              </span>
              {nodeData.modelMismatch ? (
                <XCircle className="w-4 h-4 text-red-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              )}
            </div>
          </div>
          {nodeData.modelMismatch && (
            <Alert variant="destructive" className="mt-2">
              <AlertDescription className="text-xs">
                Model mismatch detected! The executed model differs from configuration.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Token Usage */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Cpu className="w-4 h-4" />
            Token Usage (per generation)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Average Total Tokens */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Avg Total Tokens</span>
            <span className="font-medium">{nodeData.avgTokens?.toLocaleString() || 0}</span>
          </div>
          
          {/* Average Prompt Tokens */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Avg Prompt (Input)</span>
            <span>{nodeData.avgPromptTokens?.toLocaleString() || 0}</span>
          </div>
          
          {/* Average Output Tokens */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Avg Output</span>
            <span>
              {nodeData.avgOutputTokens?.toLocaleString() || 0}
              <span className="text-muted-foreground ml-1">
                ({nodeData.thresholdPercent || 0}% of max)
              </span>
            </span>
          </div>
          
          <Separator />
          
          {/* Max output seen */}
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Max Output Seen</span>
            <span>{nodeData.maxOutputTokensSeen?.toLocaleString() || 0}</span>
          </div>
          
          {/* Model max output */}
          <div className="text-xs text-muted-foreground">
            Model Max Output: {modelInfo ? formatTokenCount(modelInfo.maxOutputTokens) : 'Unknown'} tokens
          </div>

          {/* At max threshold warning */}
          {nodeData.atMaxCount && nodeData.atMaxCount > 0 && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs ml-2">
                {nodeData.atMaxCount} of {nodeData.totalGenerations} generations hit max tokens
              </AlertDescription>
            </Alert>
          )}

          {modelComparisons.length > 0 && (
            <>
              <Separator className="my-3" />
              <div className="text-xs text-muted-foreground mb-2">Model Switch Analysis:</div>
              {modelComparisons.map(comparison => (
                <div key={comparison.id} className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">{comparison.name}:</span>
                  <span className={cn(
                    comparison.wouldHitMax ? "text-red-500" : "text-green-600"
                  )}>
                    {comparison.thresholdPercent}% of threshold
                    {comparison.wouldHitMax && " ⚠️"}
                  </span>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* Speed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Speed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span>Avg Response</span>
              <div className="flex items-center gap-2">
                {getScoreIcon(nodeData.speedScore || 50)}
                <span className="font-medium">
                  {nodeData.avgSpeedMs ? `${nodeData.avgSpeedMs.toLocaleString()} ms` : 'No data'}
                </span>
              </div>
            </div>
            {nodeData.speedScore !== undefined && (
              <Progress 
                value={nodeData.speedScore} 
                className="h-2"
                indicatorClassName={getScoreColor(nodeData.speedScore)}
              />
            )}
          </div>
          
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Fastest</span>
            <span>{nodeData.minSpeedMs ? `${nodeData.minSpeedMs.toLocaleString()} ms` : 'N/A'}</span>
          </div>
          
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Slowest</span>
            <span className={cn(
              nodeData.maxSpeedMs && nodeData.maxSpeedMs > 5000 ? "text-red-500" : ""
            )}>
              {nodeData.maxSpeedMs ? `${nodeData.maxSpeedMs.toLocaleString()} ms` : 'N/A'}
            </span>
          </div>
          
          <div className="text-xs text-muted-foreground mt-2">
            {nodeData.avgSpeedMs && nodeData.avgSpeedMs < 1000 && "Status: Fast response times"}
            {nodeData.avgSpeedMs && nodeData.avgSpeedMs >= 1000 && nodeData.avgSpeedMs < 3000 && "Status: Normal speed"}
            {nodeData.avgSpeedMs && nodeData.avgSpeedMs >= 3000 && "Status: Slow responses detected"}
          </div>
        </CardContent>
      </Card>

      {/* Cost Analysis */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <DollarSign className="w-4 h-4" />
            Cost Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Average cost - primary metric */}
          <div className="flex justify-between items-center">
            <span>Avg Cost per Generation</span>
            <div className="flex items-center gap-2">
              {getScoreIcon(nodeData.costScore || 0)}
              <span className="text-lg font-bold">
                {nodeData.avgCost !== undefined ? formatCost(nodeData.avgCost) : 'N/A'}
              </span>
            </div>
          </div>
          
          {nodeData.costScore !== undefined && (
            <Progress 
              value={nodeData.costScore} 
              className="h-2"
              indicatorClassName={getScoreColor(nodeData.costScore)}
            />
          )}
          
          <Separator />
          
          {/* Total cost and generations */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Total Spend</div>
              <div className="font-semibold">{formatCost(nodeData.totalCost || 0)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Generations</div>
              <div className="font-semibold">{nodeData.totalGenerations || 0}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overall Score */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Overall Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-2xl font-bold">{nodeData.overallScore || 0}%</span>
              <span className={cn(
                "px-3 py-1 rounded-full text-sm font-medium text-white",
                getScoreColor(nodeData.overallScore || 0)
              )}>
                {getScoreLabel(nodeData.overallScore || 0)}
              </span>
            </div>
            <Progress 
              value={nodeData.overallScore || 0} 
              className="h-3"
              indicatorClassName={getScoreColor(nodeData.overallScore || 0)}
            />
            <p className="text-xs text-muted-foreground">
              Higher is better: 70-100% healthy, 40-69% warning, 0-39% problem
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Suggestions */}
      {nodeData.suggestions && nodeData.suggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Optimization Suggestions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {nodeData.suggestions.map((suggestion, index) => (
              <Alert key={index}>
                <Zap className="h-4 w-4" />
                <AlertDescription className="ml-2 text-sm">
                  {suggestion}
                </AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
