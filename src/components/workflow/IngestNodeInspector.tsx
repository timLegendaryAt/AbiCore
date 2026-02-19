import { useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { IngestSourceType } from '@/types/workflow';
import { Plug, Globe, Webhook, Download, RefreshCw, Zap, RefreshCcw, Loader2, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

interface IngestNodeInspectorProps {
  nodeId: string;
}

interface IngestSource {
  id: string;
  integration_id: string;
  ingest_point_id: string;
  name: string;
  description: string | null;
  fields: string[];
  is_active: boolean;
  sort_order: number;
}

// Static integration metadata (for branding/display)
const INTEGRATION_META: Record<string, { name: string; initials: string; color: string; description: string }> = {
  abivc: {
    name: 'AbiVC',
    initials: 'AV',
    color: 'hsl(239 84% 67%)',
    description: 'Venture capital deal flow platform'
  },
  abi: {
    name: 'Abi',
    initials: 'AB',
    color: 'hsl(160 84% 39%)',
    description: 'Enterprise analytics platform'
  }
};

export function IngestNodeInspector({ nodeId }: IngestNodeInspectorProps) {
  const { workflow, updateNodeConfig, forceRunCascade, runSystemWorkflows, selectedCompanyId } = useWorkflowStore();
  const selectedNode = workflow.nodes.find(n => n.id === nodeId);
  
  const [isRunningCascade, setIsRunningCascade] = useState(false);
  const [isRunningSystem, setIsRunningSystem] = useState(false);

  // Fetch ingest sources from database
  const { data: ingestSources = [], isLoading, refetch } = useQuery({
    queryKey: ['integration-ingest-sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_ingest_sources')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return (data || []) as IngestSource[];
    }
  });

  // Group sources by integration
  const sourcesByIntegration = ingestSources.reduce((acc, source) => {
    if (!acc[source.integration_id]) {
      acc[source.integration_id] = [];
    }
    acc[source.integration_id].push(source);
    return acc;
  }, {} as Record<string, IngestSource[]>);

  // Get available integrations (only those with sources)
  const availableIntegrations = Object.keys(sourcesByIntegration);

  const currentSourceType = (selectedNode?.config?.sourceType as IngestSourceType) || 'integration';
  const currentIntegrationId = selectedNode?.config?.integrationId;
  const currentIngestPointId = selectedNode?.config?.ingestPointId;

  // Get current integration's sources
  const currentIntegrationSources = currentIntegrationId ? sourcesByIntegration[currentIntegrationId] || [] : [];
  const currentSource = currentIntegrationSources.find(s => s.ingest_point_id === currentIngestPointId);
  const currentIntegrationMeta = currentIntegrationId ? INTEGRATION_META[currentIntegrationId] : null;

  const handleSourceTypeChange = (sourceType: IngestSourceType) => {
    if (sourceType === 'integration') {
      // Default to first available integration
      const defaultIntegrationId = availableIntegrations[0] || 'abivc';
      const defaultSources = sourcesByIntegration[defaultIntegrationId] || [];
      const defaultSource = defaultSources[0];
      const meta = INTEGRATION_META[defaultIntegrationId];
      
      updateNodeConfig(nodeId, {
        sourceType,
        integrationId: defaultIntegrationId,
        integrationName: meta?.name || defaultIntegrationId,
        ingestPointId: defaultSource?.ingest_point_id,
        ingestPointName: defaultSource?.name,
        source: 'company_ingest', // For backward compatibility
      });
    } else {
      // API or Webhook - just update sourceType
      updateNodeConfig(nodeId, {
        sourceType,
        integrationId: undefined,
        integrationName: undefined,
        ingestPointId: undefined,
        ingestPointName: undefined,
        source: 'company_ingest',
      });
    }
  };

  const handleIntegrationChange = (integrationId: string) => {
    const sources = sourcesByIntegration[integrationId] || [];
    const defaultSource = sources[0];
    const meta = INTEGRATION_META[integrationId];
    
    updateNodeConfig(nodeId, {
      integrationId,
      integrationName: meta?.name || integrationId,
      ingestPointId: defaultSource?.ingest_point_id,
      ingestPointName: defaultSource?.name,
      source: 'company_ingest',
    });
  };

  const handleIngestPointChange = (ingestPointId: string) => {
    const source = currentIntegrationSources.find(s => s.ingest_point_id === ingestPointId);
    updateNodeConfig(nodeId, {
      ingestPointId,
      ingestPointName: source?.name,
    });
  };

  const handleForceRunCascade = async () => {
    if (!selectedCompanyId) {
      toast.error('Please select a company first');
      return;
    }
    setIsRunningCascade(true);
    try {
      const result = await forceRunCascade(nodeId);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      toast.error('Failed to run cascade');
    } finally {
      setIsRunningCascade(false);
    }
  };

  const handleRunSystemWorkflows = async () => {
    if (!selectedCompanyId) {
      toast.error('Please select a company first');
      return;
    }
    setIsRunningSystem(true);
    try {
      const result = await runSystemWorkflows(nodeId);
      if (result.success) {
        toast.success(result.message, {
          description: 'Check Errors & Alerts for execution details'
        });
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('Failed to run system workflows:', error);
      toast.error('Failed to trigger system workflows');
    } finally {
      setIsRunningSystem(false);
    }
  };

  if (!selectedNode) return null;

  return (
    <div className="space-y-4">
      {/* Source Type Selector */}
      <div>
        <Label htmlFor="source_type">Source Type</Label>
        <Select value={currentSourceType} onValueChange={(v) => handleSourceTypeChange(v as IngestSourceType)}>
          <SelectTrigger id="source_type">
            <SelectValue placeholder="Select source type..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="integration">
              <div className="flex items-center gap-2">
                <Plug className="h-4 w-4" />
                <span>Integration</span>
              </div>
            </SelectItem>
            <SelectItem value="api" disabled>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                <span>API Endpoint</span>
                <span className="text-xs text-muted-foreground">(Coming Soon)</span>
              </div>
            </SelectItem>
            <SelectItem value="webhook" disabled>
              <div className="flex items-center gap-2">
                <Webhook className="h-4 w-4" />
                <span>Webhook</span>
                <span className="text-xs text-muted-foreground">(Coming Soon)</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Integration-specific UI */}
      {currentSourceType === 'integration' && (
        <>
          {/* Integration Partner Selector */}
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="integration_partner">Integration Partner</Label>
              <button 
                onClick={() => refetch()} 
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                disabled={isLoading}
              >
                <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            <Select 
              value={currentIntegrationId || ''} 
              onValueChange={handleIntegrationChange}
              disabled={isLoading}
            >
              <SelectTrigger id="integration_partner">
                <SelectValue placeholder={isLoading ? "Loading..." : "Select integration..."} />
              </SelectTrigger>
              <SelectContent>
                {availableIntegrations.length === 0 && !isLoading ? (
                  <SelectItem value="none" disabled>No integrations available</SelectItem>
                ) : (
                  availableIntegrations.map((integrationId) => {
                    const meta = INTEGRATION_META[integrationId];
                    return (
                      <SelectItem key={integrationId} value={integrationId}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center text-white"
                            style={{ backgroundColor: meta?.color || 'hsl(var(--muted))' }}
                          >
                            {meta?.initials || integrationId.substring(0, 2).toUpperCase()}
                          </div>
                          <span>{meta?.name || integrationId}</span>
                        </div>
                      </SelectItem>
                    );
                  })
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Ingest Source Selector */}
          {currentIntegrationId && (
            <div>
              <Label htmlFor="ingest_source">Ingest Source</Label>
              <Select 
                value={currentIngestPointId || ''} 
                onValueChange={handleIngestPointChange}
              >
                <SelectTrigger id="ingest_source">
                  <SelectValue placeholder="Select ingest source..." />
                </SelectTrigger>
                <SelectContent>
                  {currentIntegrationSources.length === 0 ? (
                    <SelectItem value="none" disabled>No sources configured</SelectItem>
                  ) : (
                    currentIntegrationSources.map((source) => (
                      <SelectItem key={source.ingest_point_id} value={source.ingest_point_id}>
                        <div className="flex items-center gap-2">
                          <Download className="h-4 w-4" />
                          <span>{source.name}</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Info Panel for Integration */}
          {currentIntegrationMeta && currentSource && (
            <div 
              className="p-4 rounded-lg border"
              style={{ borderColor: `${currentIntegrationMeta.color}40` }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div 
                  className="w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center text-white"
                  style={{ backgroundColor: currentIntegrationMeta.color }}
                >
                  {currentIntegrationMeta.initials}
                </div>
                <div>
                  <p className="font-medium text-foreground">{currentIntegrationMeta.name}</p>
                  <p className="text-xs text-muted-foreground">{currentSource.name}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {currentSource.description || currentIntegrationMeta.description}
              </p>
              {currentSource.fields && currentSource.fields.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Available Data</p>
                  <div className="flex flex-wrap gap-1">
                    {currentSource.fields.map((field: string) => (
                      <span 
                        key={field} 
                        className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        {field}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Info Panels for other source types */}
      {currentSourceType === 'api' && (
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <p className="font-medium text-foreground">API Endpoint</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Configure a custom API endpoint to receive data. Coming soon.
          </p>
        </div>
      )}

      {currentSourceType === 'webhook' && (
        <div className="p-4 rounded-lg bg-muted/50 border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Webhook className="h-5 w-5 text-muted-foreground" />
            <p className="font-medium text-foreground">Webhook</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Create a webhook URL to receive real-time data pushes. Coming soon.
          </p>
        </div>
      )}

      {/* Pause Checkbox */}
      <div className="flex items-center space-x-2 pt-4 border-t border-border">
        <Checkbox
          id="pause_node"
          checked={selectedNode?.config?.paused || false}
          onCheckedChange={(checked) => updateNodeConfig(nodeId, { paused: !!checked })}
        />
        <Label htmlFor="pause_node" className="flex flex-col cursor-pointer">
          <span className="text-sm font-medium">Pause this node</span>
          <span className="text-xs text-muted-foreground font-normal">
            Skip this node and all downstream during workflow runs
          </span>
        </Label>
      </div>

      {/* Trigger Execution Section */}
      <div className="space-y-3 pt-4 border-t border-border">
        <Label className="text-sm font-medium">Trigger Execution</Label>
        
        <Button
          variant="outline"
          className="w-full justify-start gap-2 h-auto py-3"
          onClick={handleForceRunCascade}
          disabled={isRunningCascade || isRunningSystem}
        >
          {isRunningCascade ? (
            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
          ) : (
            <Zap className="h-4 w-4 text-amber-500 flex-shrink-0" />
          )}
          <div className="text-left">
            <div className="font-medium">Force Run Cascade</div>
            <div className="text-xs text-muted-foreground font-normal">
              Execute this node + downstream on canvas
            </div>
          </div>
        </Button>
        
        <Button
          variant="outline"
          className="w-full justify-start gap-2 h-auto py-3"
          onClick={handleRunSystemWorkflows}
          disabled={isRunningCascade || isRunningSystem}
        >
          {isRunningSystem ? (
            <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
          ) : (
            <RefreshCcw className="h-4 w-4 text-blue-500 flex-shrink-0" />
          )}
          <div className="text-left">
            <div className="font-medium">Run Full System Workflows</div>
            <div className="text-xs text-muted-foreground font-normal">
              Trigger all connected workflows across system
            </div>
          </div>
        </Button>
        
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          <span>
            Simulates a data change at this ingest point. 
            Results appear in Errors & Alerts.
          </span>
        </div>
      </div>
    </div>
  );
}
