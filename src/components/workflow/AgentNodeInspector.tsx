import { useWorkflowStore } from '@/store/workflowStore';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AlertCircle, Database, Webhook, Zap, CheckCircle2, LayoutGrid, FileStack } from 'lucide-react';
import { AgentConfig, AgentExecutionType, MappingMode } from '@/types/workflow';

interface AgentNodeInspectorProps {
  nodeId: string;
}

export function AgentNodeInspector({ nodeId }: AgentNodeInspectorProps) {
  const { workflow, updateNodeConfig } = useWorkflowStore();
  
  const node = workflow.nodes.find(n => n.id === nodeId);
  if (!node) return null;

  const config = (node.config || {}) as AgentConfig;
  const executionType = config.executionType || 'ssot_update';
  const sourceNodeId = config.sourceNodeId;
  
  // Migration: resolve mode from new mode field or legacy schema_only
  const ssotConfig = config.ssotConfig || {
    mode: 'data' as MappingMode,
    target_company_source: 'current' as const,
    auto_approve_l4: false,
    require_approval_create: true,
  };
  
  // Handle legacy schema_only field migration
  const currentMode: MappingMode = ssotConfig.mode || (ssotConfig.schema_only ? 'schema' : 'data');

  // Get available upstream nodes that could be dependencies (promptTemplate nodes with outputs)
  const availableSources = workflow.nodes
    .filter(n => 
      n.id !== nodeId && 
      (n.type === 'promptTemplate' || n.type === 'variable' || n.type === 'integration')
    )
    .map(n => ({
      id: n.id,
      label: n.label,
      type: n.type,
    }));

  const handleExecutionTypeChange = (value: AgentExecutionType) => {
    updateNodeConfig(nodeId, {
      ...config,
      executionType: value,
    });
  };

  const handleSourceChange = (value: string) => {
    const sourceNode = workflow.nodes.find(n => n.id === value);
    updateNodeConfig(nodeId, {
      ...config,
      sourceNodeId: value,
      sourceNodeLabel: sourceNode?.label || value,
    });
  };

  const handleModeChange = (value: string) => {
    if (value === 'schema' || value === 'data') {
      updateNodeConfig(nodeId, {
        ...config,
        ssotConfig: {
          ...ssotConfig,
          mode: value as MappingMode,
          // Clear legacy field when setting new mode
          schema_only: undefined,
        },
      });
    }
  };

  const handleSSOTConfigChange = (key: keyof typeof ssotConfig, value: any) => {
    updateNodeConfig(nodeId, {
      ...config,
      ssotConfig: {
        ...ssotConfig,
        [key]: value,
      },
    });
  };

  const isConfigured = !!sourceNodeId;

  return (
    <div className="space-y-4">
      {/* Configuration Status */}
      <Card className={isConfigured ? 'border-green-500/50 bg-green-500/5' : 'border-amber-500/50 bg-amber-500/5'}>
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center gap-2">
            {isConfigured ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-600 dark:text-green-400">
                  Configured: Will process output from "{config.sourceNodeLabel}"
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-amber-600 dark:text-amber-400">
                  Select a source node to configure this mapping
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Execution Type (hidden for now - only SSOT is supported) */}
      {executionType !== 'ssot_update' && (
        <div>
          <Label htmlFor="executionType">Execution Type</Label>
          <Select value={executionType} onValueChange={handleExecutionTypeChange}>
            <SelectTrigger id="executionType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ssot_update">
                <div className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-blue-500" />
                  <div className="flex flex-col items-start">
                    <span>SSOT Update</span>
                    <span className="text-xs text-muted-foreground">Process AI-generated change plans</span>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="webhook" disabled>
                <div className="flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-purple-500" />
                  <div className="flex flex-col items-start">
                    <span>Webhook</span>
                    <span className="text-xs text-muted-foreground">Coming soon</span>
                  </div>
                </div>
              </SelectItem>
              <SelectItem value="custom" disabled>
                <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <div className="flex flex-col items-start">
                    <span>Custom Action</span>
                    <span className="text-xs text-muted-foreground">Coming soon</span>
                  </div>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Mapping Mode Selector */}
      {executionType === 'ssot_update' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4" />
              Mapping Mode
            </CardTitle>
            <CardDescription className="text-xs">
              Choose whether to create schema or write data
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleGroup 
              type="single" 
              value={currentMode} 
              onValueChange={handleModeChange}
              className="grid grid-cols-2 gap-2"
            >
              <ToggleGroupItem 
                value="schema" 
                className="flex flex-col items-center gap-1 h-auto py-3 data-[state=on]:bg-primary/10 data-[state=on]:border-primary"
              >
                <LayoutGrid className="h-5 w-5" />
                <span className="text-sm font-medium">Schema</span>
              </ToggleGroupItem>
              <ToggleGroupItem 
                value="data" 
                className="flex flex-col items-center gap-1 h-auto py-3 data-[state=on]:bg-primary/10 data-[state=on]:border-primary"
              >
                <FileStack className="h-5 w-5" />
                <span className="text-sm font-medium">Data</span>
              </ToggleGroupItem>
            </ToggleGroup>

            {/* Mode Description */}
            <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
              {currentMode === 'schema' ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Schema Mode</p>
                  <p className="text-xs text-muted-foreground">
                    Creates new L1C/L2/L3/L4 fields in the Master Schema registry. 
                    Rejects all data write actions (overwrite/append).
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Data Mode</p>
                  <p className="text-xs text-muted-foreground">
                    Writes values to existing fields in company_master_data. 
                    Rejects field creation actions.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source Dependency */}
      <div>
        <Label htmlFor="sourceNode">Source Node</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Select which node's output to process
        </p>
        <Select value={sourceNodeId || ''} onValueChange={handleSourceChange}>
          <SelectTrigger id="sourceNode">
            <SelectValue placeholder="Select source node..." />
          </SelectTrigger>
          <SelectContent>
            {availableSources.length === 0 ? (
              <div className="p-2 text-sm text-muted-foreground text-center">
                No compatible nodes available
              </div>
            ) : (
              availableSources.map(source => (
                <SelectItem key={source.id} value={source.id}>
                  <div className="flex items-center gap-2">
                    <span>{source.label}</span>
                    <span className="text-xs text-muted-foreground">({source.type})</span>
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Mode-specific Settings */}
      {executionType === 'ssot_update' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              {currentMode === 'schema' ? 'Schema Settings' : 'Data Settings'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Schema Mode Settings */}
            {currentMode === 'schema' && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="requireApprovalCreate" className="text-sm">Require Approval for New Fields</Label>
                  <p className="text-xs text-muted-foreground">
                    Require admin approval when creating new schema fields
                  </p>
                </div>
                <Switch 
                  id="requireApprovalCreate"
                  checked={ssotConfig.require_approval_create} 
                  onCheckedChange={(v) => handleSSOTConfigChange('require_approval_create', v)}
                />
              </div>
            )}

            {/* Data Mode Settings */}
            {currentMode === 'data' && (
              <>
                <div>
                  <Label htmlFor="targetCompany">Target Company</Label>
                  <Select 
                    value={ssotConfig.target_company_source} 
                    onValueChange={(v) => handleSSOTConfigChange('target_company_source', v)}
                  >
                    <SelectTrigger id="targetCompany">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">
                        <div className="flex flex-col items-start">
                          <span>Current Company</span>
                          <span className="text-xs text-muted-foreground">Apply to the company being processed</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="from_input">
                        <div className="flex flex-col items-start">
                          <span>From Input</span>
                          <span className="text-xs text-muted-foreground">Extract company ID from source output</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="autoApproveL4" className="text-sm">Auto-approve L4 Changes</Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically apply input-level field updates
                    </p>
                  </div>
                  <Switch 
                    id="autoApproveL4"
                    checked={ssotConfig.auto_approve_l4} 
                    onCheckedChange={(v) => handleSSOTConfigChange('auto_approve_l4', v)}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
