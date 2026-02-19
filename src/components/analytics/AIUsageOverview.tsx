import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Coins, Hash, Zap, TrendingUp } from 'lucide-react';

interface CategoryBreakdown {
  generation: { calls: number; cost: number; tokens: number };
  evaluation: { calls: number; cost: number; tokens: number };
  summary: { calls: number; cost: number; tokens: number };
  verification: { calls: number; cost: number; tokens: number };
}

interface UsageSummary {
  totalTokens: number;
  totalCost: number;
  totalCalls: number;
  mostUsedModel: string | null;
  promptTokens: number;
  completionTokens: number;
  categoryBreakdown: CategoryBreakdown;
}

export const AIUsageOverview = () => {
  const { data: summary, isLoading } = useQuery({
    queryKey: ['ai-usage', 'summary'],
    queryFn: async (): Promise<UsageSummary> => {
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('model, prompt_tokens, completion_tokens, total_tokens, estimated_cost, usage_category');

      if (error) throw error;

      if (!data || data.length === 0) {
        return {
          totalTokens: 0,
          totalCost: 0,
          totalCalls: 0,
          mostUsedModel: null,
          promptTokens: 0,
          completionTokens: 0,
          categoryBreakdown: {
            generation: { calls: 0, cost: 0, tokens: 0 },
            evaluation: { calls: 0, cost: 0, tokens: 0 },
            summary: { calls: 0, cost: 0, tokens: 0 },
            verification: { calls: 0, cost: 0, tokens: 0 },
          },
        };
      }

      const totalTokens = data.reduce((sum, log) => sum + (log.total_tokens || 0), 0);
      const totalCost = data.reduce((sum, log) => sum + (Number(log.estimated_cost) || 0), 0);
      const promptTokens = data.reduce((sum, log) => sum + (log.prompt_tokens || 0), 0);
      const completionTokens = data.reduce((sum, log) => sum + (log.completion_tokens || 0), 0);

      // Find most used model
      const modelCounts = data.reduce((acc, log) => {
        acc[log.model] = (acc[log.model] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const mostUsedModel = Object.entries(modelCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || null;

      // Build category breakdown
      const categoryBreakdown: CategoryBreakdown = {
        generation: { calls: 0, cost: 0, tokens: 0 },
        evaluation: { calls: 0, cost: 0, tokens: 0 },
        summary: { calls: 0, cost: 0, tokens: 0 },
        verification: { calls: 0, cost: 0, tokens: 0 },
      };

      for (const log of data) {
        const category = log.usage_category || 'generation';
        const cost = Number(log.estimated_cost) || 0;
        const tokens = log.total_tokens || 0;
        
        if (category === 'generation' || !category) {
          categoryBreakdown.generation.calls += 1;
          categoryBreakdown.generation.cost += cost;
          categoryBreakdown.generation.tokens += tokens;
        } else if (category.startsWith('evaluation_')) {
          categoryBreakdown.evaluation.calls += 1;
          categoryBreakdown.evaluation.cost += cost;
          categoryBreakdown.evaluation.tokens += tokens;
        } else if (category === 'summary') {
          categoryBreakdown.summary.calls += 1;
          categoryBreakdown.summary.cost += cost;
          categoryBreakdown.summary.tokens += tokens;
        } else if (category === 'verification') {
          categoryBreakdown.verification.calls += 1;
          categoryBreakdown.verification.cost += cost;
          categoryBreakdown.verification.tokens += tokens;
        }
      }

      return {
        totalTokens,
        totalCost,
        totalCalls: data.length,
        mostUsedModel,
        promptTokens,
        completionTokens,
        categoryBreakdown,
      };
    },
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  };

  const formatCost = (cost: number): string => {
    return cost.toFixed(4);
  };

  const formatModelName = (model: string | null): string => {
    if (!model) return 'N/A';
    return model.replace('google/', '').replace('openai/', '');
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-32 mb-1" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
          <Hash className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatNumber(summary?.totalTokens || 0)}</div>
          <p className="text-xs text-muted-foreground">
            {formatNumber(summary?.promptTokens || 0)} in / {formatNumber(summary?.completionTokens || 0)} out
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Estimated Cost</CardTitle>
          <Coins className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">${formatCost(summary?.totalCost || 0)}</div>
          <p className="text-xs text-muted-foreground">
            Gen: ${formatCost(summary?.categoryBreakdown?.generation?.cost || 0)} • 
            Eval: ${formatCost(summary?.categoryBreakdown?.evaluation?.cost || 0)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">AI Calls</CardTitle>
          <Zap className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{summary?.totalCalls || 0}</div>
          <p className="text-xs text-muted-foreground">
            Total API calls
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Most Used Model</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold truncate">
            {formatModelName(summary?.mostUsedModel || null)}
          </div>
          <p className="text-xs text-muted-foreground">
            By call count
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
