import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Entity, EntityNodeData } from '@/types/entity';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EntityNodeDataViewer } from './EntityNodeDataViewer';
import { ArrowLeft, Building2, Play, Loader2, Database, Layers, Settings, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface EntityDetailViewProps {
  entity: Entity;
  onBack: () => void;
}

export function EntityDetailView({ entity, onBack }: EntityDetailViewProps) {
  const [nodeData, setNodeData] = useState<EntityNodeData[]>([]);
  const [nodeDataLoading, setNodeDataLoading] = useState(false);
  const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([]);
  const [assignedWorkflows, setAssignedWorkflows] = useState<{ id: string; name: string }[]>([]);
  const [runningWorkflows, setRunningWorkflows] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [nodeDataExpanded, setNodeDataExpanded] = useState(true);
  const { toast } = useToast();

  const fetchNodeData = async () => {
    try {
      setNodeDataLoading(true);
      const { data, error } = await supabase
        .from('entity_node_data')
        .select('*')
        .eq('entity_id', entity.id)
        .order('workflow_id')
        .order('last_executed_at', { ascending: false });

      if (error) throw error;
      setNodeData((data || []) as EntityNodeData[]);
    } catch (error) {
      console.error('Error fetching entity node data:', error);
    } finally {
      setNodeDataLoading(false);
    }
  };

  const fetchWorkflows = async () => {
    try {
      const { data: allWorkflows, error: allError } = await supabase
        .from('workflows')
        .select('id, name, settings')
        .order('name');

      if (allError) throw allError;
      setWorkflows((allWorkflows || []).map(w => ({ id: w.id, name: w.name })));

      const assigned = (allWorkflows || []).filter(w => {
        const settings = w.settings as { data_attribution?: string; assigned_entity_id?: string } | null;
        return settings?.data_attribution === 'entity_data' && settings?.assigned_entity_id === entity.id;
      });
      setAssignedWorkflows(assigned.map(w => ({ id: w.id, name: w.name })));
    } catch (error) {
      console.error('Error fetching workflows:', error);
    }
  };

  useEffect(() => {
    fetchNodeData();
    fetchWorkflows();
  }, [entity.id]);

  const handleRunWorkflows = async (workflowId?: string) => {
    try {
      setRunningWorkflows(true);
      
      const { data, error } = await supabase.functions.invoke('run-entity-workflows', {
        body: { entity_id: entity.id, workflow_id: workflowId },
      });

      if (error) throw error;

      toast({
        title: 'Workflows executed',
        description: `Processed ${data?.workflows_processed || 0} workflow(s) for ${entity.name}.`,
      });

      fetchNodeData();
    } catch (error: any) {
      console.error('Error running entity workflows:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to run workflows',
        variant: 'destructive',
      });
    } finally {
      setRunningWorkflows(false);
    }
  };

  const getEntityTypeLabel = (type: string) => {
    switch (type) {
      case 'external_platform':
        return 'External Platform';
      case 'internal':
        return 'Internal';
      case 'integration':
        return 'Integration';
      default:
        return type;
    }
  };

  const filteredNodeData = selectedWorkflowId
    ? nodeData.filter(n => n.workflow_id === selectedWorkflowId)
    : nodeData;

  const handleNodeDataClick = (workflowId: string | null) => {
    setSelectedWorkflowId(workflowId);
    setActiveTab('node-data');
  };

  return (
    <div className="flex flex-col h-full w-full bg-background">
      {/* Header */}
      <div className="border-b px-6 py-4 space-y-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to entities
        </Button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: entity.color || 'hsl(var(--muted))' }}
            >
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">{entity.name}</h2>
                <Badge variant="outline" className="font-mono text-xs">
                  {entity.slug}
                </Badge>
              </div>
              <p className="text-muted-foreground text-sm">{entity.description || 'No description'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={entity.is_active ? 'default' : 'secondary'}>
              {entity.is_active ? 'Active' : 'Inactive'}
            </Badge>
            <Badge variant="secondary">{getEntityTypeLabel(entity.entity_type)}</Badge>
          </div>
        </div>
      </div>

      {/* Main layout with sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r bg-muted/30 p-4 flex flex-col min-h-0">
          <nav className="space-y-1 flex-1 overflow-y-auto">
            <Button
              variant={activeTab === 'details' ? 'secondary' : 'ghost'}
              className="w-full justify-start gap-2"
              onClick={() => setActiveTab('details')}
            >
              <Settings className="h-4 w-4" />
              Details
            </Button>

            <Collapsible open={nodeDataExpanded} onOpenChange={setNodeDataExpanded}>
              <CollapsibleTrigger asChild>
                <Button
                  variant={activeTab === 'node-data' ? 'secondary' : 'ghost'}
                  className="w-full justify-start gap-2"
                  onClick={() => handleNodeDataClick(null)}
                >
                  {nodeDataExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <Database className="h-4 w-4" />
                  Node Data
                  {nodeData.length > 0 && (
                    <Badge variant="outline" className="ml-auto text-xs">
                      {nodeData.length}
                    </Badge>
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-6 space-y-1 mt-1">
                <Button
                  variant={activeTab === 'node-data' && !selectedWorkflowId ? 'secondary' : 'ghost'}
                  size="sm"
                  className="w-full justify-start text-sm"
                  onClick={() => handleNodeDataClick(null)}
                >
                  All Workflows
                </Button>
                {assignedWorkflows.map((wf) => (
                  <Button
                    key={wf.id}
                    variant={activeTab === 'node-data' && selectedWorkflowId === wf.id ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-full justify-start text-sm truncate"
                    onClick={() => handleNodeDataClick(wf.id)}
                  >
                    {wf.name}
                  </Button>
                ))}
              </CollapsibleContent>
            </Collapsible>

            <Button
              variant={activeTab === 'workflows' ? 'secondary' : 'ghost'}
              className="w-full justify-start gap-2"
              onClick={() => setActiveTab('workflows')}
            >
              <Layers className="h-4 w-4" />
              Workflows
              {assignedWorkflows.length > 0 && (
                <Badge variant="outline" className="ml-auto text-xs">
                  {assignedWorkflows.length}
                </Badge>
              )}
            </Button>
          </nav>
        </aside>

        {/* Content area */}
        <main className="flex-1 p-6 overflow-auto min-h-0">
          {activeTab === 'details' && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Entity Information</CardTitle>
                  <CardDescription>Basic details about this entity</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Name</label>
                      <p className="text-sm">{entity.name}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Slug</label>
                      <p className="text-sm font-mono">{entity.slug}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Type</label>
                      <p className="text-sm">{getEntityTypeLabel(entity.entity_type)}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Status</label>
                      <Badge variant={entity.is_active ? 'default' : 'secondary'}>
                        {entity.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                  {entity.description && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Description</label>
                      <p className="text-sm">{entity.description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Timestamps</CardTitle>
                    <CardDescription>Creation and update times</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Created</label>
                      <p className="text-sm">
                        {entity.created_at ? format(new Date(entity.created_at), 'PPpp') : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Last Updated</label>
                      <p className="text-sm">
                        {entity.updated_at ? format(new Date(entity.updated_at), 'PPpp') : 'N/A'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {entity.metadata && Object.keys(entity.metadata).length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Metadata</CardTitle>
                      <CardDescription>Additional entity data</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-48">
                        {JSON.stringify(entity.metadata, null, 2)}
                      </pre>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {activeTab === 'node-data' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">Workflow Outputs</h3>
                  {selectedWorkflowId && (
                    <Badge variant="outline">
                      {assignedWorkflows.find(w => w.id === selectedWorkflowId)?.name || 'Filtered'}
                    </Badge>
                  )}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button disabled={runningWorkflows || assignedWorkflows.length === 0}>
                      {runningWorkflows ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      Run Workflows
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-popover">
                    <DropdownMenuItem onClick={() => handleRunWorkflows()}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Run All Workflows
                    </DropdownMenuItem>
                    {assignedWorkflows.map((wf) => (
                      <DropdownMenuItem key={wf.id} onClick={() => handleRunWorkflows(wf.id)}>
                        <Play className="mr-2 h-4 w-4" />
                        {wf.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <EntityNodeDataViewer
                nodeData={filteredNodeData}
                workflows={workflows}
                loading={nodeDataLoading}
              />
            </div>
          )}

          {activeTab === 'workflows' && (
            <Card>
              <CardHeader>
                <CardTitle>Assigned Workflows</CardTitle>
                <CardDescription>
                  Workflows configured to store data for this entity
                </CardDescription>
              </CardHeader>
              <CardContent>
                {assignedWorkflows.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Layers className="h-8 w-8 mb-2" />
                    <p>No workflows assigned</p>
                    <p className="text-sm">
                      Assign workflows by setting "Entity Data" attribution and selecting this entity
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {assignedWorkflows.map((wf) => (
                      <li
                        key={wf.id}
                        className="flex items-center justify-between p-3 rounded-md border"
                      >
                        <span className="text-sm font-medium">{wf.name}</span>
                        <Badge variant="outline">entity_data</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
