import { useEffect, useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, Clock, CheckCircle2, AlertCircle, Loader2, Zap, AlertTriangle, Database } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface NodePreviewTabProps {
  nodeId: string;
}

export function NodePreviewTab({ nodeId }: NodePreviewTabProps) {
  const { 
    nodePreviewData, 
    loadNodePreview, 
    runTestNodes,
    forceRunCascade,
    selectedCompanyId,
    isForceRunning,
    workflow 
  } = useWorkflowStore();
  
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isForceRunningNode, setIsForceRunningNode] = useState(false);
  
  const previewData = nodePreviewData.get(nodeId);
  const node = workflow.nodes.find(n => n.id === nodeId);
  
  // Check if this node type supports force run
  const supportsForceRun = node && ['promptTemplate', 'ingest', 'dataset', 'agent'].includes(node.type);
  
  useEffect(() => {
    // Load preview data when component mounts OR when company changes
    loadNodePreview(nodeId);
  }, [nodeId, selectedCompanyId, loadNodePreview]);
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await runTestNodes([nodeId]);
      await loadNodePreview(nodeId);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleForceRun = async () => {
    if (!selectedCompanyId) {
      toast.error('Please select a company first');
      return;
    }
    
    setIsForceRunningNode(true);
    const result = await forceRunCascade(nodeId);
    setIsForceRunningNode(false);
    
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };
  
  const formatOutput = (output: any): string => {
    if (output === undefined || output === null) {
      return 'No output';
    }
    if (typeof output === 'string') {
      // Try to parse as JSON for prettier display
      try {
        const parsed = JSON.parse(output);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return output;
      }
    }
    return JSON.stringify(output, null, 2);
  };
  
  const getStatusIcon = () => {
    if (previewData?.isLoading) {
      return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
    }
    if (previewData?.error) {
      return <AlertCircle className="w-4 h-4 text-destructive" />;
    }
    if (previewData?.cached) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    if (previewData?.executedAt) {
      return <CheckCircle2 className="w-4 h-4 text-primary" />;
    }
    return <Clock className="w-4 h-4 text-muted-foreground" />;
  };
  
  const getStatusText = () => {
    if (previewData?.isLoading) {
      return 'Executing...';
    }
    if (previewData?.error) {
      return 'Error';
    }
    if (!previewData?.executedAt) {
      return 'Not yet executed';
    }
    if (previewData?.cached) {
      return 'Fresh (cached)';
    }
    return 'Executed';
  };
  
  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <h3 className="text-sm font-medium text-foreground">Preview</h3>
        <div className="flex items-center gap-1">
          {/* Force Run button - full production cascade */}
          {supportsForceRun && selectedCompanyId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleForceRun}
                  disabled={isForceRunningNode || isForceRunning || previewData?.isLoading}
                  className="h-8 px-2"
                >
                  {isForceRunningNode ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4 text-amber-500" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Force Run + Downstream (Full Cascade)</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {/* Test refresh button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing || previewData?.isLoading}
                className="h-8 px-2"
              >
                <RefreshCw className={cn("w-4 h-4", (isRefreshing || previewData?.isLoading) && "animate-spin")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Test Run (Quick Preview)</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      
      {/* Status */}
      <div className="flex items-center gap-2 p-3 bg-muted rounded-lg flex-shrink-0">
        {getStatusIcon()}
        <div className="flex-1">
          <p className="text-sm font-medium">{getStatusText()}</p>
          {previewData?.executedAt && (
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(previewData.executedAt), { addSuffix: true })}
            </p>
          )}
        </div>
      </div>
      
      {/* Error Display */}
      {previewData?.error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex-shrink-0">
          <p className="text-sm text-destructive">{previewData.error}</p>
        </div>
      )}
      
      {/* Output Display */}
      <div className="flex-1 min-h-0">
        <p className="text-xs font-medium text-muted-foreground mb-2">Output:</p>
        
        {/* Check for NO_SUBMISSION_DATA error */}
        {previewData?.output?._error === 'NO_SUBMISSION_DATA' ? (
          <Alert variant="default" className="border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-600 dark:text-amber-400">No Submission Data</AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground mt-1">
              {previewData.output._message || 'No intake submission found for this company.'}
              <div className="mt-3 flex items-center gap-2">
                <Database className="h-4 w-4" />
                <span className="text-xs">Sync data from the integration or add a manual submission on the Companies page.</span>
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <ScrollArea className="h-full max-h-[400px] rounded-lg border border-border bg-background">
            <pre className="p-3 text-xs text-foreground whitespace-pre-wrap break-words font-mono">
              {previewData?.isLoading 
                ? 'Loading...'
                : formatOutput(previewData?.output)
              }
            </pre>
          </ScrollArea>
        )}
      </div>
      
      {/* Help text */}
      {!previewData?.executedAt && !previewData?.isLoading && (
        <p className="text-xs text-muted-foreground flex-shrink-0">
          Click the refresh button or select this node and click "Validate" to run a test.
        </p>
      )}
    </div>
  );
}
