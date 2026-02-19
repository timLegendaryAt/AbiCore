import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format, subDays, parseISO, startOfDay } from 'date-fns';

interface DailyUsage {
  date: string;
  tokens: number;
  cost: number;
  calls: number;
}

export const UsageOverTimeChart = () => {
  const { data: dailyUsage, isLoading } = useQuery({
    queryKey: ['ai-usage', 'over-time'],
    queryFn: async (): Promise<DailyUsage[]> => {
      // Get last 30 days
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('created_at, total_tokens, estimated_cost')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (!data || data.length === 0) return [];

      // Aggregate by day
      const dailyMap = new Map<string, DailyUsage>();
      
      data.forEach(log => {
        const date = format(startOfDay(parseISO(log.created_at)), 'yyyy-MM-dd');
        const existing = dailyMap.get(date) || { date, tokens: 0, cost: 0, calls: 0 };
        existing.tokens += log.total_tokens || 0;
        existing.cost += Number(log.estimated_cost) || 0;
        existing.calls += 1;
        dailyMap.set(date, existing);
      });

      return Array.from(dailyMap.values());
    },
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Usage Over Time</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <Skeleton className="h-full w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!dailyUsage || dailyUsage.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Usage Over Time</CardTitle>
        </CardHeader>
        <CardContent className="h-80 flex items-center justify-center">
          <p className="text-muted-foreground">No usage data yet</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = dailyUsage.map(d => ({
    ...d,
    displayDate: format(parseISO(d.date), 'MMM d'),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Usage Over Time (Last 30 Days)</CardTitle>
      </CardHeader>
      <CardContent className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="displayDate" 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
            />
            <YAxis 
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickFormatter={formatNumber}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
              formatter={(value: number, name: string) => {
                if (name === 'tokens') return [formatNumber(value), 'Tokens'];
                if (name === 'calls') return [value, 'API Calls'];
                return [value, name];
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="tokens"
              name="Tokens"
              stroke="hsl(217, 91%, 60%)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="calls"
              name="API Calls"
              stroke="hsl(142, 71%, 45%)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
