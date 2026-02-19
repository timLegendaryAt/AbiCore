import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface CategoryUsage {
  category: string;
  calls: number;
  cost: number;
  tokens: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  generation: 'Primary Generation',
  evaluation_hallucination: 'Hallucination Eval',
  evaluation_data_quality: 'Data Quality Eval',
  evaluation_complexity: 'Complexity Eval',
  summary: 'Improvement Summary',
  verification: 'Model Verification',
};

const CATEGORY_COLORS: Record<string, string> = {
  generation: 'hsl(217, 91%, 60%)',           // Blue
  evaluation_hallucination: 'hsl(142, 71%, 45%)', // Green
  evaluation_data_quality: 'hsl(48, 96%, 53%)',   // Yellow
  evaluation_complexity: 'hsl(24, 95%, 53%)',     // Orange
  summary: 'hsl(262, 83%, 58%)',               // Purple
  verification: 'hsl(186, 76%, 46%)',          // Teal
};

// Group evaluation categories together
const groupCategories = (data: CategoryUsage[]): CategoryUsage[] => {
  const grouped: Record<string, CategoryUsage> = {};
  
  for (const item of data) {
    let groupKey = item.category;
    
    // Group all evaluation_ types into one
    if (item.category.startsWith('evaluation_')) {
      groupKey = 'evaluation';
    }
    
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        category: groupKey,
        calls: 0,
        cost: 0,
        tokens: 0,
      };
    }
    
    grouped[groupKey].calls += item.calls;
    grouped[groupKey].cost += item.cost;
    grouped[groupKey].tokens += item.tokens;
  }
  
  return Object.values(grouped);
};

const GROUPED_LABELS: Record<string, string> = {
  generation: 'Primary Generation',
  evaluation: 'Quality Evaluations',
  summary: 'Improvement Summary',
  verification: 'Model Verification',
};

const GROUPED_COLORS: Record<string, string> = {
  generation: 'hsl(217, 91%, 60%)',   // Blue
  evaluation: 'hsl(142, 71%, 45%)',   // Green
  summary: 'hsl(262, 83%, 58%)',      // Purple
  verification: 'hsl(186, 76%, 46%)', // Teal
};

export const CostCategoryBreakdown = () => {
  const { data: categoryUsage, isLoading } = useQuery({
    queryKey: ['ai-usage', 'by-category'],
    queryFn: async (): Promise<CategoryUsage[]> => {
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('usage_category, total_tokens, estimated_cost');

      if (error) throw error;

      if (!data || data.length === 0) return [];

      // Aggregate by category
      const aggregated = data.reduce((acc, log) => {
        const category = log.usage_category || 'generation';
        if (!acc[category]) {
          acc[category] = { category, calls: 0, cost: 0, tokens: 0 };
        }
        acc[category].calls += 1;
        acc[category].cost += Number(log.estimated_cost) || 0;
        acc[category].tokens += log.total_tokens || 0;
        return acc;
      }, {} as Record<string, CategoryUsage>);

      return Object.values(aggregated);
    },
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  const formatCost = (cost: number): string => {
    return `$${cost.toFixed(4)}`;
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
          <CardTitle>Cost by Category</CardTitle>
        </CardHeader>
        <CardContent className="h-80 flex items-center justify-center">
          <Skeleton className="h-64 w-64 rounded-full" />
        </CardContent>
      </Card>
    );
  }

  if (!categoryUsage || categoryUsage.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cost by Category</CardTitle>
        </CardHeader>
        <CardContent className="h-80 flex items-center justify-center">
          <p className="text-muted-foreground">No usage data yet</p>
        </CardContent>
      </Card>
    );
  }

  // Group evaluation categories
  const groupedData = groupCategories(categoryUsage);
  const totalCost = groupedData.reduce((sum, c) => sum + c.cost, 0);

  const chartData = groupedData
    .filter(c => c.cost > 0)
    .map(c => ({
      name: GROUPED_LABELS[c.category] || c.category,
      value: c.cost,
      calls: c.calls,
      tokens: c.tokens,
      percentage: totalCost > 0 ? ((c.cost / totalCost) * 100).toFixed(1) : '0',
      color: GROUPED_COLORS[c.category] || 'hsl(var(--muted-foreground))',
    }))
    .sort((a, b) => b.value - a.value);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost by Category</CardTitle>
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
              label={({ name, percentage }) => `${name} (${percentage}%)`}
              labelLine={false}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string, props: any) => [
                `${formatCost(value)} (${props.payload.calls} calls, ${formatNumber(props.payload.tokens)} tokens)`,
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
