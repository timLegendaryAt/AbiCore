import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { 
  Activity, 
  Radio, 
  Info, 
  Copy, 
  CheckCircle2, 
  XCircle, 
  Circle,
  RefreshCw,
  Clock,
  Timer
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { IngestSourcesSection } from './IngestSourcesSection';
import { ConnectionAlertsSection } from './ConnectionAlertsSection';
import { useIntegrationHealth } from '@/hooks/useIntegrationHealth';
import { formatDistanceToNow } from 'date-fns';

interface TestResult {
  id: string;
  action: string;
  status: 'success' | 'error';
  statusCode: number;
  responseTime: number;
  timestamp: Date;
  response: any;
}

type ConnectionStatus = 'unknown' | 'healthy' | 'error';

export function AbiVCConnectionPanel() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TestResult | null>(null);
  const [testHistory, setTestHistory] = useState<TestResult[]>([]);
  const [platformInfo, setPlatformInfo] = useState<{
    version?: string;
    capabilities?: string[];
    lastCheck?: Date;
    lastResponseTime?: number;
  }>({});
  const [isResolving, setIsResolving] = useState(false);
  const { toast } = useToast();
  
  // Use the new health hook for persisted data
  const { latestHealth, alerts, refreshHealth, resolveAlert } = useIntegrationHealth('abivc');

  // Sync persisted health status with local state
  useEffect(() => {
    if (latestHealth) {
      setConnectionStatus(latestHealth.status === 'healthy' ? 'healthy' : 'error');
      setPlatformInfo(prev => ({
        ...prev,
        lastCheck: new Date(latestHealth.created_at),
        lastResponseTime: latestHealth.response_time_ms ?? undefined
      }));
    }
  }, [latestHealth]);

  const handleResolveAlert = async (alertId: string) => {
    setIsResolving(true);
    await resolveAlert(alertId);
    setIsResolving(false);
    toast({ title: 'Alert Resolved', description: 'The alert has been marked as resolved' });
  };

  const callPlatformAPI = async (action: string, payload?: any) => {
    const startTime = performance.now();
    
    try {
      const { data, error } = await supabase.functions.invoke('test-platform-connection', {
        body: { action, payload, timestamp: new Date().toISOString() }
      });

      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);

      if (error) {
        throw error;
      }

      const result: TestResult = {
        id: crypto.randomUUID(),
        action,
        status: 'success',
        statusCode: 200,
        responseTime,
        timestamp: new Date(),
        response: data
      };

      return result;
    } catch (error: any) {
      const endTime = performance.now();
      const responseTime = Math.round(endTime - startTime);

      const result: TestResult = {
        id: crypto.randomUUID(),
        action,
        status: 'error',
        statusCode: error.status || 500,
        responseTime,
        timestamp: new Date(),
        response: { error: error.message || 'An error occurred' }
      };

      return result;
    }
  };

  const addToHistory = (result: TestResult) => {
    setLastResult(result);
    setTestHistory(prev => [result, ...prev].slice(0, 10));
  };

  const testHealth = async () => {
    setIsLoading('health');
    const result = await callPlatformAPI('health');
    addToHistory(result);

    if (result.status === 'success') {
      setConnectionStatus('healthy');
      setPlatformInfo(prev => ({
        ...prev,
        version: result.response?.version,
        lastCheck: new Date(),
        lastResponseTime: result.responseTime
      }));
      toast({ title: 'Health Check Passed', description: 'Platform is healthy' });
    } else {
      setConnectionStatus('error');
      toast({ title: 'Health Check Failed', description: result.response?.error, variant: 'destructive' });
    }
    setIsLoading(null);
    refreshHealth();
  };

  const testPing = async () => {
    setIsLoading('ping');
    const result = await callPlatformAPI('ping');
    addToHistory(result);

    if (result.status === 'success') {
      toast({ title: 'Ping Successful', description: `Round-trip: ${result.responseTime}ms` });
    } else {
      toast({ title: 'Ping Failed', description: result.response?.error, variant: 'destructive' });
    }
    setIsLoading(null);
  };

  const getStatus = async () => {
    setIsLoading('get_status');
    const result = await callPlatformAPI('get_status');
    addToHistory(result);

    if (result.status === 'success') {
      setConnectionStatus('healthy');
      setPlatformInfo(prev => ({
        ...prev,
        capabilities: result.response?.capabilities,
        lastCheck: new Date()
      }));
      toast({ title: 'Status Retrieved', description: 'Connection status updated' });
    } else {
      setConnectionStatus('error');
      toast({ title: 'Status Check Failed', description: result.response?.error, variant: 'destructive' });
    }
    setIsLoading(null);
    refreshHealth();
  };

  const refreshAll = async () => {
    await testHealth();
    await getStatus();
  };

  const copyResponse = () => {
    if (lastResult) {
      navigator.clipboard.writeText(JSON.stringify(lastResult.response, null, 2));
      toast({ title: 'Copied', description: 'Response copied to clipboard' });
    }
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  };

  const getNextCheckTime = () => {
    if (!platformInfo.lastCheck) return null;
    const nextCheck = new Date(platformInfo.lastCheck.getTime() + 10 * 60 * 1000);
    const now = new Date();
    if (nextCheck <= now) return 'Soon';
    const minutes = Math.ceil((nextCheck.getTime() - now.getTime()) / 60000);
    return `~${minutes} min`;
  };

  const StatusIcon = () => {
    if (connectionStatus === 'healthy') {
      return <CheckCircle2 className="h-8 w-8 text-green-500" />;
    } else if (connectionStatus === 'error') {
      return <XCircle className="h-8 w-8 text-destructive" />;
    }
    return <Circle className="h-8 w-8 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      {/* Connection Alerts */}
      <ConnectionAlertsSection 
        alerts={alerts} 
        onResolve={handleResolveAlert}
        isResolving={isResolving}
      />

      {/* Status Overview Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            AbiVC Platform Connection
          </CardTitle>
          <CardDescription>
            Test and monitor the connection to the AbiVC platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <StatusIcon />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">
                  {connectionStatus === 'healthy' ? 'Connected' : 
                   connectionStatus === 'error' ? 'Connection Error' : 'Unknown'}
                </span>
                <Badge variant={connectionStatus === 'healthy' ? 'default' : 'secondary'}>
                  {platformInfo.version || 'v?.?.?'}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
                {platformInfo.lastCheck && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Last check: {formatDistanceToNow(platformInfo.lastCheck, { addSuffix: true })}
                    {platformInfo.lastResponseTime && ` (${platformInfo.lastResponseTime}ms)`}
                  </span>
                )}
                {getNextCheckTime() && (
                  <span className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    Next scheduled: {getNextCheckTime()}
                  </span>
                )}
              </div>
              {platformInfo.capabilities && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {platformInfo.capabilities.map(cap => (
                    <Badge key={cap} variant="outline" className="text-xs">
                      {cap}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Button 
          onClick={testHealth} 
          disabled={isLoading !== null}
          variant="outline"
        >
          {isLoading === 'health' ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Activity className="h-4 w-4 mr-2" />
          )}
          Test Health
        </Button>
        <Button 
          onClick={testPing} 
          disabled={isLoading !== null}
          variant="outline"
        >
          {isLoading === 'ping' ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Radio className="h-4 w-4 mr-2" />
          )}
          Ping
        </Button>
        <Button 
          onClick={getStatus} 
          disabled={isLoading !== null}
          variant="outline"
        >
          {isLoading === 'get_status' ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Info className="h-4 w-4 mr-2" />
          )}
          Get Status
        </Button>
        <Button 
          onClick={refreshAll} 
          disabled={isLoading !== null}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
          Refresh All
        </Button>
      </div>

      {/* Response Display */}
      {lastResult && (
        <Card className={cn(
          "border-2",
          lastResult.status === 'success' ? "border-green-500/30" : "border-destructive/30"
        )}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Badge variant={lastResult.status === 'success' ? 'default' : 'destructive'}>
                  {lastResult.action}
                </Badge>
                <span className="text-muted-foreground font-normal text-sm">
                  {lastResult.responseTime}ms
                </span>
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={copyResponse}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <pre className="text-sm bg-muted p-4 rounded-lg overflow-x-auto">
                {JSON.stringify(lastResult.response, null, 2)}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Test History */}
      {testHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Recent Tests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {testHistory.map(result => (
                <div 
                  key={result.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground w-16">
                      {formatTimeAgo(result.timestamp)}
                    </span>
                    <Badge variant="outline">{result.action}</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                      {result.statusCode}
                    </Badge>
                    <span className="text-muted-foreground w-16 text-right">
                      {result.responseTime}ms
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ingest Sources Section */}
      <IngestSourcesSection 
        integrationId="abivc"
        integrationName="AbiVC"
        integrationColor="hsl(239 84% 67%)"
      />
    </div>
  );
}
