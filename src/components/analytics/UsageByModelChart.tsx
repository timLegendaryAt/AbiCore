import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface ModelUsage {
  model: string;
  tokens: number;
  calls: number;
  cost: number;
}

const COLORS = [
  'hsl(217, 91%, 60%)',  // Blue (Google)
  'hsl(142, 71%, 45%)',  // Green (OpenAI)
  'hsl(262, 83%, 58%)',  // Purple
  'hsl(24, 95%, 53%)',   // Orange
  'hsl(346, 77%, 49%)',  // Red
  'hsl(180, 70%, 45%)',  // Teal
];

export const UsageByModelChart = () => {
  const { data: modelUsage, isLoading } = useQuery({
    queryKey: ['ai-usage', 'by-model'],
    queryFn: async (): Promise<ModelUsage[]> => {
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('model, total_tokens, estimated_cost');

      if (error) throw error;

      if (!data || data.length === 0) return [];

      // Aggregate by model
      const aggregated = data.reduce((acc, log) => {
        if (!acc[log.model]) {
          acc[log.model] = { model: log.model, tokens: 0, calls: 0, cost: 0 };
        }
        acc[log.model].tokens += log.total_tokens || 0;
        acc[log.model].calls += 1;
        acc[log.model].cost += Number(log.estimated_cost) || 0;
        return acc;
      }, {} as Record<string, ModelUsage>);

      return Object.values(aggregated)
        .sort((a, b) => b.tokens - a.tokens)
        .slice(0, 6); // Top 6 models
    },
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  const formatModelName = (model: string): string => {
    return model.replace('google/', '').replace('openai/', '');
  };

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Usage by Model</CardTitle>
        </CardHeader>
        <CardContent className="h-80 flex items-center justify-center">
          <Skeleton className="h-64 w-64 rounded-full" />
        </CardContent>
      </Card>
    );
  }

  if (!modelUsage || modelUsage.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Usage by Model</CardTitle>
        </CardHeader>
        <CardContent className="h-80 flex items-center justify-center">
          <p className="text-muted-foreground">No usage data yet</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = modelUsage.map(m => ({
    name: formatModelName(m.model),
    value: m.tokens,
    calls: m.calls,
    cost: m.cost,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage by Model</CardTitle>
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey="value"
              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
              labelLine={false}
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string, props: any) => [
                `${formatNumber(value)} tokens (${props.payload.calls} calls)`,
                name,
              ]}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
