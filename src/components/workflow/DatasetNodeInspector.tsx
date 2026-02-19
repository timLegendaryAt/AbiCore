import { useState } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Database } from '@/integrations/supabase/types';
import { Integration } from '@/types/integration';
import { DatasetSourceType, SharedCache } from '@/types/workflow';
import { Database as DatabaseIcon, FileText, Layers, HardDrive, Plus, RefreshCw, Loader2 } from 'lucide-react';
import { CreateSharedCacheDialog } from './CreateSharedCacheDialog';
import { toast } from 'sonner';

type Dataset = Database['public']['Tables']['datasets']['Row'];

interface DatasetNodeInspectorProps {
  nodeId: string;
}

export function DatasetNodeInspector({ nodeId }: DatasetNodeInspectorProps) {
  const { workflow, updateNodeConfig, syncSharedCaches, selectedCompanyId } = useWorkflowStore();
  const [isSyncing, setIsSyncing] = useState(false);
  const selectedNode = workflow.nodes.find(n => n.id === nodeId);

  const { data: datasets, isLoading } = useQuery({
    queryKey: ['datasets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('datasets')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Dataset[];
    }
  });

  const { data: integrations, isLoading: integrationsLoading } = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('connected', true)
        .order('name');
      if (error) throw error;
      return data as Integration[];
    }
  });

  const { data: sharedCaches, isLoading: cachesLoading } = useQuery({
    queryKey: ['shared_caches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shared_caches')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as SharedCache[];
    }
  });

  const queryClient = useQueryClient();
  const [showCreateCacheDialog, setShowCreateCacheDialog] = useState(false);

  const currentSourceType = selectedNode?.config?.sourceType as DatasetSourceType | undefined;

  const handleSourceTypeChange = (sourceType: string) => {
    if (sourceType === 'ssot_schema') {
      updateNodeConfig(nodeId, {
        sourceType: 'ssot_schema',
        datasetId: undefined,
        datasetName: undefined,
        integrationId: undefined,
        integrationName: undefined,
        sharedCacheId: undefined,
        sharedCacheName: undefined,
        source: 'ssot_schema',
        fetchLive: true,
      });
    } else if (sourceType === 'manual') {
      updateNodeConfig(nodeId, {
        sourceType: 'manual',
        datasetId: undefined,
        datasetName: undefined,
        integrationId: undefined,
        integrationName: undefined,
        sharedCacheId: undefined,
        sharedCacheName: undefined,
        source: '',
      });
    } else if (sourceType === 'shared_cache') {
      updateNodeConfig(nodeId, {
        sourceType: 'shared_cache',
        datasetId: undefined,
        datasetName: undefined,
        integrationId: undefined,
        integrationName: undefined,
        source: '',
      });
    } else {
      // Clear source type to show dataset/integration selection
      updateNodeConfig(nodeId, {
        sourceType: undefined,
        sharedCacheId: undefined,
        sharedCacheName: undefined,
        source: '',
      });
    }
  };

  const handleSharedCacheSelect = (cacheId: string) => {
    if (!cacheId || cacheId === 'none') {
      updateNodeConfig(nodeId, {
        sharedCacheId: undefined,
        sharedCacheName: undefined,
      });
      return;
    }
    
    const cache = sharedCaches?.find(c => c.id === cacheId);
    if (cache) {
      updateNodeConfig(nodeId, {
        sourceType: 'shared_cache',
        sharedCacheId: cache.id,
        sharedCacheName: cache.name,
        datasetId: undefined,
        datasetName: undefined,
        integrationId: undefined,
        integrationName: undefined,
        source: `shared_cache:${cache.id}`,
      });
    }
  };

  const handleCacheCreated = (cache: { id: string; name: string }) => {
    queryClient.invalidateQueries({ queryKey: ['shared_caches'] });
    handleSharedCacheSelect(cache.id);
  };

  const handleDatasetSelect = (datasetId: string) => {
    if (!datasetId || datasetId === 'none') {
      updateNodeConfig(nodeId, {
        sourceType: undefined,
        datasetId: undefined,
        datasetName: undefined,
      });
      return;
    }
    
    const dataset = datasets?.find(d => d.id === datasetId);
    if (dataset) {
      updateNodeConfig(nodeId, {
        sourceType: 'dataset',
        datasetId: dataset.id,
        datasetName: dataset.name,
        integrationId: undefined,
        integrationName: undefined,
        source: dataset.category === 'workflow' 
          ? `workflow:${dataset.id}` 
          : dataset.name,
      });
    }
  };

  const handleIntegrationSelect = (integrationId: string) => {
    if (!integrationId || integrationId === 'none') {
      updateNodeConfig(nodeId, {
        sourceType: undefined,
        integrationId: undefined,
        integrationName: undefined,
      });
      return;
    }
    
    const integration = integrations?.find(i => i.id === integrationId);
    if (integration) {
      updateNodeConfig(nodeId, {
        sourceType: 'integration',
        integrationId: integration.id,
        integrationName: integration.name,
        datasetId: undefined,
        datasetName: undefined,
        source: `integration:${integration.id}`,
      });
    }
  };

  const handleConfigChange = (key: string, value: any) => {
    updateNodeConfig(nodeId, {
      [key]: value
    });
  };

  const selectedDataset = datasets?.find(d => d.id === selectedNode?.config.datasetId);
  const selectedIntegration = integrations?.find(i => i.id === selectedNode?.config.integrationId);

  if (!selectedNode) return null;

  const selectedSharedCache = sharedCaches?.find(c => c.id === selectedNode?.config.sharedCacheId);

  // Determine which view to show based on current source type
  const getDisplaySourceType = (): string => {
    if (currentSourceType === 'ssot_schema') return 'ssot_schema';
    if (currentSourceType === 'manual') return 'manual';
    if (currentSourceType === 'shared_cache') return 'shared_cache';
    if (currentSourceType === 'dataset' || selectedNode.config.datasetId) return 'select';
    if (currentSourceType === 'integration' || selectedNode.config.integrationId) return 'select';
    return 'select'; // Default to select mode
  };

  return (
    <div className="space-y-4">
      {/* Data Source Type Selector */}
      <div>
        <Label htmlFor="source_type">Data Source Type</Label>
        <Select 
          value={getDisplaySourceType()} 
          onValueChange={handleSourceTypeChange}
        >
          <SelectTrigger id="source_type">
            <SelectValue placeholder="Choose source type..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="select">
              <div className="flex items-center gap-2">
                <DatabaseIcon className="w-4 h-4" />
                Dataset / Integration
              </div>
            </SelectItem>
            <SelectItem value="ssot_schema">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4" />
                SSOT Schema Snapshot
              </div>
            </SelectItem>
            <SelectItem value="manual">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Manual Entry
              </div>
            </SelectItem>
            <SelectItem value="shared_cache">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4" />
                Shared Cache
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">
          Use <strong>Ingest</strong> nodes for receiving new data submissions.
        </p>
      </div>

      {/* SSOT Schema Snapshot Info */}
      {getDisplaySourceType() === 'ssot_schema' && (
        <div className="p-3 bg-muted rounded-lg space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline">SSOT Schema</Badge>
            <p className="text-sm font-medium text-foreground">Company Schema (Master)</p>
          </div>
          <p className="text-xs text-muted-foreground">
            Provides a complete snapshot of the schema for the company this 
            workflow runs for. Includes full L1C/L2/L3/L4 hierarchy, scoring 
            metadata, and parent-child relationships.
          </p>
          <div className="text-xs space-y-1.5 mt-2">
            <div className="font-medium text-foreground">Schema includes:</div>
            <div className="flex items-center gap-2">
              <Layers className="w-3 h-3 text-muted-foreground" />
              <span>10 domains with field hierarchy (L2→L3→L4)</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="w-3 h-3 text-muted-foreground" />
              <span>Field definitions: <code className="text-[10px] bg-muted-foreground/10 px-1 rounded">id</code>, <code className="text-[10px] bg-muted-foreground/10 px-1 rounded">parent_field_id</code>, <code className="text-[10px] bg-muted-foreground/10 px-1 rounded">level</code></span>
            </div>
            <div className="flex items-center gap-2">
              <DatabaseIcon className="w-3 h-3 text-muted-foreground" />
              <span>Scoring: <code className="text-[10px] bg-muted-foreground/10 px-1 rounded">is_scored</code>, <code className="text-[10px] bg-muted-foreground/10 px-1 rounded">evaluation_method</code></span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-2 italic">
            Use in SSOT Mapping nodes for schema-aware data population 
            or change planning.
          </p>
          
          {/* Fetch Live toggle */}
          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
            <Checkbox
              id="fetch_live"
              checked={selectedNode.config.fetchLive ?? true}
              onCheckedChange={(checked) => 
                handleConfigChange('fetchLive', checked === true)
              }
            />
            <div className="space-y-0.5">
              <Label htmlFor="fetch_live" className="text-sm cursor-pointer">
                Fetch Live Data
              </Label>
              <p className="text-xs text-muted-foreground">
                Always pull fresh SSOT data when referenced. Changes won't trigger re-runs.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Shared Cache Selection */}
      {getDisplaySourceType() === 'shared_cache' && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="cache_select">Select Shared Cache</Label>
            <Select 
              value={selectedNode.config.sharedCacheId || ''} 
              onValueChange={handleSharedCacheSelect}
            >
              <SelectTrigger id="cache_select">
                <SelectValue placeholder="Choose a shared cache..." />
              </SelectTrigger>
              <SelectContent>
                {cachesLoading ? (
                  <SelectItem value="loading" disabled>Loading caches...</SelectItem>
                ) : sharedCaches && sharedCaches.length > 0 ? (
                  <>
                    <SelectItem value="none">None</SelectItem>
                    {sharedCaches.map((cache) => (
                      <SelectItem key={cache.id} value={cache.id}>
                        <div className="flex items-center gap-2">
                          <HardDrive className="w-4 h-4 text-violet-500" />
                          {cache.name}
                        </div>
                      </SelectItem>
                    ))}
                  </>
                ) : (
                  <SelectItem value="none" disabled>No shared caches available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Create New Button */}
          <Button 
            variant="outline" 
            className="w-full justify-start gap-2"
            onClick={() => setShowCreateCacheDialog(true)}
          >
            <Plus className="w-4 h-4" />
            Create New Shared Cache
          </Button>

          {/* Selected cache info */}
          {selectedSharedCache && (
            <div className="p-3 rounded-lg space-y-2" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-violet-300 text-violet-700">Shared Cache</Badge>
                <HardDrive className="w-4 h-4 text-violet-500" />
                <p className="text-sm font-medium text-foreground">{selectedSharedCache.name}</p>
              </div>
              {selectedSharedCache.description && (
                <p className="text-xs text-muted-foreground">{selectedSharedCache.description}</p>
              )}
              <p className="text-xs text-muted-foreground italic">
                Data can be written to this cache by generative nodes configured with this cache as an output destination.
              </p>
              
              {/* Sync Cache Button */}
              {selectedCompanyId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setIsSyncing(true);
                    const result = await syncSharedCaches([selectedSharedCache.id]);
                    setIsSyncing(false);
                    if (result.success) {
                      toast.success(result.message);
                    } else {
                      toast.error(result.message);
                    }
                  }}
                  disabled={isSyncing}
                  className="w-full gap-2 mt-2"
                >
                  {isSyncing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Sync Cache
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Dataset and Integration Selection */}
      {getDisplaySourceType() === 'select' && (
        <>
          {/* Data source selector */}
          <div>
            <Label htmlFor="dataset_select">Select Dataset (Optional)</Label>
            <Select 
              value={selectedNode.config.datasetId || ''} 
              onValueChange={handleDatasetSelect}
            >
              <SelectTrigger id="dataset_select">
                <SelectValue placeholder="Choose a dataset..." />
              </SelectTrigger>
              <SelectContent>
                {isLoading ? (
                  <SelectItem value="loading" disabled>Loading datasets...</SelectItem>
                ) : datasets && datasets.length > 0 ? (
                  <>
                    <SelectItem value="none">None</SelectItem>
                    {datasets.map((dataset) => (
                      <SelectItem key={dataset.id} value={dataset.id}>
                        <div className="flex items-center gap-2">
                          {dataset.name}
                          <Badge variant="secondary" className="text-xs">
                            {dataset.category}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </>
                ) : (
                  <SelectItem value="none" disabled>No datasets available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="integration_select">Select Integration (Optional)</Label>
            <Select 
              value={selectedNode.config.integrationId || ''} 
              onValueChange={handleIntegrationSelect}
            >
              <SelectTrigger id="integration_select">
                <SelectValue placeholder="Choose an integration..." />
              </SelectTrigger>
              <SelectContent>
                {integrationsLoading ? (
                  <SelectItem value="loading" disabled>Loading integrations...</SelectItem>
                ) : integrations && integrations.length > 0 ? (
                  <>
                    <SelectItem value="none">None</SelectItem>
                    {integrations.map((integration) => (
                      <SelectItem key={integration.id} value={integration.id}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-4 h-4 rounded flex items-center justify-center text-white text-xs font-bold"
                            style={{ backgroundColor: integration.color }}
                          >
                            {integration.initials}
                          </div>
                          {integration.name}
                          <Badge variant="outline" className="text-xs">
                            {integration.category}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </>
                ) : (
                  <SelectItem value="none" disabled>No integrations available</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Show selected dataset info */}
          {selectedNode.config.datasetId && selectedDataset && (
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Dataset</Badge>
                <p className="text-sm font-medium text-foreground">{selectedDataset.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {selectedDataset.category}
                </Badge>
                {selectedDataset.dependencies && Array.isArray(selectedDataset.dependencies) && (
                  <p className="text-xs text-muted-foreground">
                    {selectedDataset.dependencies.length} {selectedDataset.dependencies.length === 1 ? 'dependency' : 'dependencies'}
                  </p>
                )}
              </div>
              {selectedDataset.description && (
                <p className="text-xs text-muted-foreground">{selectedDataset.description}</p>
              )}
            </div>
          )}

          {/* Show selected integration info */}
          {selectedNode.config.integrationId && selectedIntegration && (
            <div className="p-3 bg-muted rounded-lg space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline">Integration</Badge>
                <div 
                  className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: selectedIntegration.color }}
                >
                  {selectedIntegration.initials}
                </div>
                <p className="text-sm font-medium text-foreground">{selectedIntegration.name}</p>
              </div>
              <Badge variant="outline" className="text-xs">
                {selectedIntegration.category}
              </Badge>
              {selectedIntegration.description && (
                <p className="text-xs text-muted-foreground">{selectedIntegration.description}</p>
              )}
              
              {/* AbiVC/Abi Integration - Show available input fields */}
              {(selectedIntegration.name === 'AbiVC' || selectedIntegration.name === 'Abi') && (
                <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                  <p className="text-xs font-medium text-foreground">Available Input Fields:</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <code className="bg-muted-foreground/10 px-1.5 py-0.5 rounded">company_data</code>
                      <span className="text-muted-foreground">JSON - Company details</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <code className="bg-muted-foreground/10 px-1.5 py-0.5 rounded">company_data.name</code>
                      <span className="text-muted-foreground">string</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <code className="bg-muted-foreground/10 px-1.5 py-0.5 rounded">company_data.industry</code>
                      <span className="text-muted-foreground">string</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <code className="bg-muted-foreground/10 px-1.5 py-0.5 rounded">intake_submissions</code>
                      <span className="text-muted-foreground">array</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <code className="bg-muted-foreground/10 px-1.5 py-0.5 rounded">metadata</code>
                      <span className="text-muted-foreground">JSON</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Use <code className="bg-muted-foreground/10 px-1 rounded">{"{{company_data.name}}"}</code> in prompts to reference this data.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Manual configuration fields - show for manual and select modes */}
      {(currentSourceType === 'manual' || getDisplaySourceType() === 'select') && (
        <>
          <div>
            <Label htmlFor="source">Source</Label>
            <Input 
              id="source" 
              value={selectedNode.config.source || ''} 
              onChange={e => handleConfigChange('source', e.target.value)} 
              placeholder="Upload CSV/JSON or enter URL" 
            />
          </div>

          <div>
            <Label htmlFor="path">Path/Key</Label>
            <Input 
              id="path" 
              value={selectedNode.config.path || ''} 
              onChange={e => handleConfigChange('path', e.target.value)} 
              placeholder="e.g., data.items" 
            />
          </div>

          <div>
            <Label htmlFor="sample_size">Sample Size</Label>
            <Input 
              id="sample_size" 
              type="number" 
              value={selectedNode.config.sample_size || 10} 
              onChange={e => handleConfigChange('sample_size', parseInt(e.target.value))} 
            />
          </div>
        </>
      )}

      {/* Create Shared Cache Dialog */}
      <CreateSharedCacheDialog
        open={showCreateCacheDialog}
        onOpenChange={setShowCreateCacheDialog}
        onCreated={handleCacheCreated}
      />
    </div>
  );
}
