import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Cloud, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';

interface AbiSyncHistoryEntry {
  id: string;
  company_id: string;
  sync_type: string;
  status: string;
  fields_synced: number | null;
  context_facts_synced: number | null;
  filtered_count: number | null;
  schema_version: string | null;
  webhook_status: number | null;
  error_message: string | null;
  execution_time_ms: number | null;
  triggered_by: string | null;
  created_at: string | null;
}

interface AbiSyncLogCardProps {
  companyId: string;
  refreshTrigger?: number;
}

export function AbiSyncLogCard({ companyId, refreshTrigger }: AbiSyncLogCardProps) {
  const [syncHistory, setSyncHistory] = useState<AbiSyncHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchSyncHistory = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('abi_sync_history')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data) {
      setSyncHistory(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSyncHistory();
  }, [companyId, refreshTrigger]);

  const lastSync = syncHistory[0];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Success
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading && syncHistory.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Cloud className="h-4 w-4" />
            Abi Sync Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Cloud className="h-4 w-4" />
          Abi Sync Log
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Last Sync Summary */}
        {lastSync ? (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Last Sync</Label>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">
                {lastSync.created_at 
                  ? format(new Date(lastSync.created_at), 'MMM d, yyyy h:mm a')
                  : 'Unknown'}
              </div>
              {getStatusBadge(lastSync.status)}
            </div>
            <div className="text-xs text-muted-foreground">
              {lastSync.fields_synced ?? 0} fields • {lastSync.context_facts_synced ?? 0} facts
              {lastSync.execution_time_ms && ` • ${lastSync.execution_time_ms}ms`}
            </div>
            {lastSync.error_message && (
              <div className="text-xs text-destructive mt-1">
                {lastSync.error_message}
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            No syncs recorded yet
          </div>
        )}

        {/* Recent Syncs Table */}
        {syncHistory.length > 1 && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Recent Syncs</Label>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 text-xs">Time</TableHead>
                    <TableHead className="h-8 text-xs">Type</TableHead>
                    <TableHead className="h-8 text-xs">Fields</TableHead>
                    <TableHead className="h-8 text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {syncHistory.slice(0, 5).map((entry) => (
                    <TableRow key={entry.id} className="hover:bg-muted/50">
                      <TableCell className="py-1.5 text-xs">
                        {entry.created_at 
                          ? format(new Date(entry.created_at), 'h:mm a')
                          : '—'}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs">
                        {entry.sync_type}
                      </TableCell>
                      <TableCell className="py-1.5 text-xs">
                        {entry.fields_synced ?? 0}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {entry.status === 'success' ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        ) : entry.status === 'failed' ? (
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        ) : (
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
