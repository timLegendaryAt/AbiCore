import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';

interface UsageLog {
  id: string;
  created_at: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost: number;
  node_id: string | null;
  workflow_id: string | null;
  execution_time_ms: number | null;
}

export const RecentUsageTable = () => {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['ai-usage', 'recent'],
    queryFn: async (): Promise<UsageLog[]> => {
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    refetchOnWindowFocus: true,
    staleTime: 30000,
  });

  const formatModelName = (model: string): string => {
    return model.replace('google/', '').replace('openai/', '');
  };

  const formatNumber = (num: number): string => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  };

  const getProviderBadge = (model: string) => {
    if (model.startsWith('google/')) {
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20">Google</Badge>;
    }
    if (model.startsWith('openai/')) {
      return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">OpenAI</Badge>;
    }
    return <Badge variant="outline">Unknown</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent AI Calls</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent AI Calls</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No AI calls recorded yet. Token usage will appear here when you run workflows or use AI features.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent AI Calls</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead className="text-right">Input</TableHead>
              <TableHead className="text-right">Output</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap">
                  {format(parseISO(log.created_at), 'MMM d, HH:mm:ss')}
                </TableCell>
                <TableCell>{getProviderBadge(log.model)}</TableCell>
                <TableCell className="font-mono text-sm">
                  {formatModelName(log.model)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(log.prompt_tokens)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(log.completion_tokens)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {formatNumber(log.total_tokens)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  ${Number(log.estimated_cost).toFixed(6)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {log.execution_time_ms ? `${log.execution_time_ms}ms` : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
