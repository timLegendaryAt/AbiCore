import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { MODEL_REGISTRY, getModelById } from '@/lib/modelRegistry';
import { Workflow, NodeBase } from '@/types/workflow';
import { ArrowRight, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface NodeModelInfo {
  workflowId: string;
  workflowName: string;
  nodeId: string;
  nodeLabel: string;
  currentModel: string;
}

export function NodeMigration() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [nodeModelData, setNodeModelData] = useState<NodeModelInfo[]>([]);
  const [fromModel, setFromModel] = useState<string>('');
  const [toModel, setToModel] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);

  // Fetch all workflows
  useEffect(() => {
    const fetchWorkflows = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('load-workflows');
        
        if (error) {
          console.error('Error loading workflows:', error);
          toast.error('Failed to load workflows');
          setLoading(false);
          return;
        }

        const workflowData = data || [];
        setWorkflows(workflowData);

        // Extract all promptTemplate nodes with their models
        const nodeData: NodeModelInfo[] = [];
        workflowData.forEach((workflow: Workflow) => {
          (workflow.nodes || [])
            .filter((n: NodeBase) => n.type === 'promptTemplate')
            .forEach((node: NodeBase) => {
              nodeData.push({
                workflowId: workflow.id,
                workflowName: workflow.name,
                nodeId: node.id,
                nodeLabel: node.label,
                currentModel: node.config?.model || 'unknown',
              });
            });
        });
        setNodeModelData(nodeData);
      } catch (err) {
        console.error('Error fetching workflows:', err);
        toast.error('Failed to load workflows');
      } finally {
        setLoading(false);
      }
    };
    
    fetchWorkflows();
  }, []);

  // Group by model for summary
  const modelSummary = useMemo(() => {
    const summary = new Map<string, { count: number; workflows: Set<string> }>();
    nodeModelData.forEach(node => {
      const existing = summary.get(node.currentModel) || { count: 0, workflows: new Set() };
      existing.count++;
      existing.workflows.add(node.workflowName);
      summary.set(node.currentModel, existing);
    });
    return summary;
  }, [nodeModelData]);

  // Get affected nodes for preview
  const affectedNodes = useMemo(() => {
    if (!fromModel) return [];
    return nodeModelData.filter(n => n.currentModel === fromModel);
  }, [nodeModelData, fromModel]);

  const handleMigrate = async () => {
    if (!fromModel || !toModel || fromModel === toModel) return;

    setMigrating(true);

    try {
      // Group affected nodes by workflow
      const workflowUpdates = new Map<string, Workflow>();
      affectedNodes.forEach(node => {
        if (!workflowUpdates.has(node.workflowId)) {
          const workflow = workflows.find(w => w.id === node.workflowId);
          if (workflow) {
            workflowUpdates.set(node.workflowId, { ...workflow });
          }
        }
      });

      let successCount = 0;
      let errorCount = 0;

      // Update models in each affected workflow
      for (const [, workflow] of workflowUpdates) {
        const updatedNodes = workflow.nodes.map((node: NodeBase) => {
          if (node.type === 'promptTemplate' && node.config?.model === fromModel) {
            return {
              ...node,
              config: { ...node.config, model: toModel }
            };
          }
          return node;
        });

        const { error } = await supabase.functions.invoke('save-workflow', {
          body: { ...workflow, nodes: updatedNodes }
        });

        if (error) {
          console.error(`Error saving workflow ${workflow.name}:`, error);
          errorCount++;
        } else {
          successCount++;
        }
      }

      if (errorCount === 0) {
        toast.success(`Migrated ${affectedNodes.length} nodes across ${successCount} workflows`);
      } else {
        toast.warning(`Migrated with issues: ${successCount} workflows updated, ${errorCount} failed`);
      }

      // Reset selections and refetch
      setFromModel('');
      setToModel('');
      
      // Refetch workflows to update the UI
      setLoading(true);
      const { data } = await supabase.functions.invoke('load-workflows');
      const workflowData = data || [];
      setWorkflows(workflowData);
      
      const nodeData: NodeModelInfo[] = [];
      workflowData.forEach((workflow: Workflow) => {
        (workflow.nodes || [])
          .filter((n: NodeBase) => n.type === 'promptTemplate')
          .forEach((node: NodeBase) => {
            nodeData.push({
              workflowId: workflow.id,
              workflowName: workflow.name,
              nodeId: node.id,
              nodeLabel: node.label,
              currentModel: node.config?.model || 'unknown',
            });
          });
      });
      setNodeModelData(nodeData);
      
    } catch (err) {
      console.error('Migration error:', err);
      toast.error('Failed to complete migration');
    } finally {
      setMigrating(false);
      setLoading(false);
    }
  };

  const getModelDisplayName = (modelId: string) => {
    const model = getModelById(modelId);
    return model?.displayName || modelId;
  };

  if (loading) {
    return (
      <div className="space-y-8 pt-4">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 pt-4">
      {/* Model Usage Summary */}
      <Card>
        <CardContent className="pt-6">
          {modelSummary.size === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <AlertCircle className="h-4 w-4 mr-2" />
              No prompt nodes found in workflows
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Nodes</TableHead>
                  <TableHead className="text-right">Workflows</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from(modelSummary.entries())
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([model, data]) => (
                    <TableRow key={model}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{getModelDisplayName(model)}</span>
                          <span className="text-xs text-muted-foreground font-mono">{model}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary">{data.count}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{data.workflows.size}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Bulk Migration */}
      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4 items-end">
            <div className="space-y-2">
              <Label>Migrate nodes from</Label>
              <Select value={fromModel} onValueChange={setFromModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select current model" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(modelSummary.keys()).map(model => (
                    <SelectItem key={model} value={model}>
                      <div className="flex items-center gap-2">
                        <span>{getModelDisplayName(model)}</span>
                        <Badge variant="outline" className="text-xs">
                          {modelSummary.get(model)?.count} nodes
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-center pb-2">
              <ArrowRight className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="space-y-2">
              <Label>To</Label>
              <Select value={toModel} onValueChange={setToModel}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target model" />
                </SelectTrigger>
                <SelectContent>
                  {MODEL_REGISTRY.map(model => (
                    <SelectItem 
                      key={model.id} 
                      value={model.id}
                      disabled={model.id === fromModel}
                    >
                      <div className="flex items-center gap-2">
                        <span>{model.displayName}</span>
                        {model.recommended && (
                          <Badge className="text-xs">Recommended</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          {affectedNodes.length > 0 && toModel && fromModel !== toModel && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <p className="font-medium mb-2">
                Preview: {affectedNodes.length} node{affectedNodes.length !== 1 ? 's' : ''} will be migrated
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 max-h-40 overflow-y-auto">
                {affectedNodes.slice(0, 5).map(node => (
                  <li key={`${node.workflowId}-${node.nodeId}`}>
                    • {node.workflowName} / {node.nodeLabel}
                  </li>
                ))}
                {affectedNodes.length > 5 && (
                  <li className="text-muted-foreground/70">
                    ... and {affectedNodes.length - 5} more
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button 
              variant="outline" 
              onClick={() => { setFromModel(''); setToModel(''); }}
              disabled={migrating || (!fromModel && !toModel)}
            >
              Reset
            </Button>
            <Button
              onClick={handleMigrate}
              disabled={!fromModel || !toModel || fromModel === toModel || migrating}
            >
              {migrating ? 'Migrating...' : `Migrate ${affectedNodes.length} Node${affectedNodes.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
