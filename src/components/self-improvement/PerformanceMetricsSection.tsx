import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Clock, Cpu, DollarSign, ArrowRightLeft } from 'lucide-react';
import { MODEL_REGISTRY, getModelById, formatCost } from '@/lib/modelRegistry';

export interface PerformanceStats {
  avgSpeedMs: number | null;
  minSpeedMs: number | null;
  maxSpeedMs: number | null;
  avgE2ELatencyMs: number | null;
  minE2ELatencyMs: number | null;
  maxE2ELatencyMs: number | null;
  avgTokens: number | null;
  avgPromptTokens: number | null;
  avgCompletionTokens: number | null;
  maxTokensSeen: number | null;
  avgCost: number | null;
  totalCost: number | null;
  generationCount: number;
  currentModel: string | null;
}

export interface ModelSwitchAnalysis {
  modelId: string;
  displayName: string;
  tokenPercent: number;
  estCostPerGen: number;
  estTotalCost: number;
  costChangePercent: number;
}

interface PerformanceMetricsSectionProps {
  performanceStats: PerformanceStats | null;
  modelAnalysis: ModelSwitchAnalysis[];
  loading?: boolean;
}

export function PerformanceMetricsSection({ 
  performanceStats, 
  modelAnalysis,
  loading 
}: PerformanceMetricsSectionProps) {
  if (!performanceStats) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Performance Stats Cards */}
      <div className="grid grid-cols-5 gap-4">
        {/* AI Speed */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              AI Speed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className={cn("text-2xl font-bold", 
              performanceStats.avgSpeedMs && performanceStats.avgSpeedMs > 5000 ? 'text-destructive' : 'text-foreground'
            )}>
              {performanceStats.avgSpeedMs ? `${(performanceStats.avgSpeedMs / 1000).toFixed(1)}s` : '—'}
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Min: {performanceStats.minSpeedMs ? `${(performanceStats.minSpeedMs / 1000).toFixed(1)}s` : '—'} / 
              Max: {performanceStats.maxSpeedMs ? `${(performanceStats.maxSpeedMs / 1000).toFixed(1)}s` : '—'}
            </p>
          </CardContent>
        </Card>

        {/* E2E Latency */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              E2E Latency
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className={cn("text-2xl font-bold", 
              performanceStats.avgE2ELatencyMs && performanceStats.avgE2ELatencyMs > 30000 ? 'text-destructive' : 'text-foreground'
            )}>
              {performanceStats.avgE2ELatencyMs ? `${(performanceStats.avgE2ELatencyMs / 1000).toFixed(1)}s` : '—'}
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              {performanceStats.avgE2ELatencyMs ? 'dep → response' : 'No data yet'}
            </p>
          </CardContent>
        </Card>

        {/* Average Tokens */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4" />
              Avg Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">
              {performanceStats.avgTokens?.toLocaleString() ?? '—'}
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Output: {performanceStats.avgCompletionTokens?.toLocaleString() ?? '—'} avg
            </p>
          </CardContent>
        </Card>

        {/* Average Cost */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Avg Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">
              {performanceStats.avgCost !== null ? formatCost(performanceStats.avgCost) : '—'}
            </span>
            <p className="text-xs text-muted-foreground mt-1">per generation</p>
          </CardContent>
        </Card>

        {/* Total Cost */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">
              {performanceStats.totalCost !== null ? formatCost(performanceStats.totalCost) : '—'}
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              {performanceStats.generationCount} generations
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Model Switch Analysis */}
      {modelAnalysis.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4" />
              Model Switch Analysis
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Current: {getModelById(performanceStats.currentModel || '')?.displayName || performanceStats.currentModel || 'Unknown'}
            </p>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alternative</TableHead>
                  <TableHead className="text-right">Token %</TableHead>
                  <TableHead className="text-right">Est. Cost/Gen</TableHead>
                  <TableHead className="text-right">Est. Total</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelAnalysis.map(alt => (
                  <TableRow key={alt.modelId}>
                    <TableCell className="font-medium">{alt.displayName}</TableCell>
                    <TableCell className="text-right">{alt.tokenPercent}%</TableCell>
                    <TableCell className="text-right">{formatCost(alt.estCostPerGen)}</TableCell>
                    <TableCell className="text-right">{formatCost(alt.estTotalCost)}</TableCell>
                    <TableCell className={cn(
                      "text-right font-medium",
                      alt.costChangePercent > 0 ? 'text-destructive' : 'text-green-600'
                    )}>
                      {alt.costChangePercent > 0 ? '+' : ''}{alt.costChangePercent}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Helper function to calculate performance stats from usage logs
export function calculatePerformanceStats(logs: Array<{
  execution_time_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  estimated_cost: number | string | null;
  model: string | null;
  dependency_changed_at?: string | null;
  created_at?: string | null;
}>): PerformanceStats {
  const speeds = logs.filter(l => l.execution_time_ms != null).map(l => l.execution_time_ms!);
  const tokens = logs.filter(l => l.total_tokens != null).map(l => l.total_tokens!);
  const promptTokens = logs.filter(l => l.prompt_tokens != null).map(l => l.prompt_tokens!);
  const completionTokens = logs.filter(l => l.completion_tokens != null).map(l => l.completion_tokens!);
  const costs = logs.filter(l => l.estimated_cost != null).map(l => Number(l.estimated_cost));
  
  // Calculate E2E latencies (from dependency change to response generation)
  const e2eLatencies = logs
    .filter(l => l.dependency_changed_at && l.created_at)
    .map(l => {
      const depChangedTime = new Date(l.dependency_changed_at!).getTime();
      const responseTime = new Date(l.created_at!).getTime();
      return responseTime - depChangedTime;
    })
    .filter(latency => latency > 0); // Only positive latencies
  
  const currentModel = logs[0]?.model || null;
  
  return {
    avgSpeedMs: speeds.length > 0 ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null,
    minSpeedMs: speeds.length > 0 ? Math.min(...speeds) : null,
    maxSpeedMs: speeds.length > 0 ? Math.max(...speeds) : null,
    avgE2ELatencyMs: e2eLatencies.length > 0 ? Math.round(e2eLatencies.reduce((a, b) => a + b, 0) / e2eLatencies.length) : null,
    minE2ELatencyMs: e2eLatencies.length > 0 ? Math.min(...e2eLatencies) : null,
    maxE2ELatencyMs: e2eLatencies.length > 0 ? Math.max(...e2eLatencies) : null,
    avgTokens: tokens.length > 0 ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length) : null,
    avgPromptTokens: promptTokens.length > 0 ? Math.round(promptTokens.reduce((a, b) => a + b, 0) / promptTokens.length) : null,
    avgCompletionTokens: completionTokens.length > 0 ? Math.round(completionTokens.reduce((a, b) => a + b, 0) / completionTokens.length) : null,
    maxTokensSeen: completionTokens.length > 0 ? Math.max(...completionTokens) : null,
    avgCost: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : null,
    totalCost: costs.length > 0 ? costs.reduce((a, b) => a + b, 0) : null,
    generationCount: logs.length,
    currentModel,
  };
}

// Helper function to calculate model switch analysis
export function calculateModelSwitchAnalysis(stats: PerformanceStats): ModelSwitchAnalysis[] {
  if (!stats.avgPromptTokens || !stats.avgCompletionTokens || !stats.currentModel) {
    return [];
  }
  
  return MODEL_REGISTRY
    .filter(m => m.id !== stats.currentModel)
    .slice(0, 4)
    .map(model => {
      // Calculate estimated cost with this model
      const estCostPerGen = (
        (stats.avgPromptTokens! * model.inputCostPerMillion) +
        (stats.avgCompletionTokens! * model.outputCostPerMillion)
      ) / 1_000_000;
      
      const estTotalCost = estCostPerGen * stats.generationCount;
      
      const costChangePercent = stats.avgCost && stats.avgCost > 0
        ? Math.round(((estCostPerGen - stats.avgCost) / stats.avgCost) * 100)
        : 0;
      
      return {
        modelId: model.id,
        displayName: model.displayName,
        tokenPercent: Math.round((stats.avgCompletionTokens! / model.maxOutputTokens) * 100),
        estCostPerGen,
        estTotalCost,
        costChangePercent,
      };
    });
}
