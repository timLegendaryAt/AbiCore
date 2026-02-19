import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Entity, EntityNodeData } from '@/types/entity';
import { EntityCard } from './EntityCard';
import { EntityDetailView } from './EntityDetailView';
import { useToast } from '@/hooks/use-toast';
import { Building2, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function EntitiesTab() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);
  const [entityNodeCounts, setEntityNodeCounts] = useState<Record<string, number>>({});
  const [entityWorkflowCounts, setEntityWorkflowCounts] = useState<Record<string, number>>({});
  const [runningEntity, setRunningEntity] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEntity, setNewEntity] = useState<{
    name: string;
    slug: string;
    entity_type: 'external_platform' | 'internal' | 'integration';
    description: string;
  }>({
    name: '',
    slug: '',
    entity_type: 'external_platform',
    description: '',
  });
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const fetchEntities = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('entities')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setEntities((data || []) as Entity[]);

      // Fetch node data counts
      const { data: nodeCounts } = await supabase
        .from('entity_node_data')
        .select('entity_id');

      const counts: Record<string, number> = {};
      (nodeCounts || []).forEach((n: { entity_id: string }) => {
        counts[n.entity_id] = (counts[n.entity_id] || 0) + 1;
      });
      setEntityNodeCounts(counts);

      // Fetch assigned workflow counts
      const { data: workflows } = await supabase
        .from('workflows')
        .select('id, settings');

      const workflowCounts: Record<string, number> = {};
      (workflows || []).forEach((w: { id: string; settings: unknown }) => {
        const settings = w.settings as { data_attribution?: string; assigned_entity_id?: string } | null;
        if (settings?.data_attribution === 'entity_data' && settings?.assigned_entity_id) {
          workflowCounts[settings.assigned_entity_id] = (workflowCounts[settings.assigned_entity_id] || 0) + 1;
        }
      });
      setEntityWorkflowCounts(workflowCounts);
    } catch (error) {
      console.error('Error fetching entities:', error);
      toast({
        title: 'Error',
        description: 'Failed to load entities',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntities();
  }, []);

  const handleRunWorkflows = async (entityId: string) => {
    try {
      setRunningEntity(entityId);

      const { data, error } = await supabase.functions.invoke('run-entity-workflows', {
        body: { entity_id: entityId },
      });

      if (error) throw error;

      const entity = entities.find(e => e.id === entityId);
      toast({
        title: 'Workflows executed',
        description: `Processed ${data?.workflows_processed || 0} workflow(s) for ${entity?.name || 'entity'}.`,
      });

      // Refresh counts
      fetchEntities();
    } catch (error: any) {
      console.error('Error running entity workflows:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to run workflows',
        variant: 'destructive',
      });
    } finally {
      setRunningEntity(null);
    }
  };

  const handleAddEntity = async () => {
    if (!newEntity.name.trim() || !newEntity.slug.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Name and slug are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsCreating(true);
      const { error } = await supabase.from('entities').insert({
        name: newEntity.name.trim(),
        slug: newEntity.slug.toLowerCase().replace(/\s+/g, '-'),
        entity_type: newEntity.entity_type,
        description: newEntity.description.trim() || null,
      });

      if (error) throw error;

      toast({
        title: 'Entity created',
        description: `${newEntity.name} has been added.`,
      });

      setShowAddDialog(false);
      setNewEntity({ name: '', slug: '', entity_type: 'external_platform', description: '' });
      fetchEntities();
    } catch (error: any) {
      console.error('Error creating entity:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create entity',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  if (selectedEntity) {
    return (
      <EntityDetailView
        entity={selectedEntity}
        onBack={() => {
          setSelectedEntity(null);
          fetchEntities();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Entities</h3>
          <p className="text-sm text-muted-foreground">
            External platforms and other non-company data sources
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Entity
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : entities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Building2 className="h-12 w-12 mb-4" />
          <p className="text-lg font-medium">No entities yet</p>
          <p className="text-sm">Add entities to manage external platform workflows</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {entities.map((entity) => (
            <EntityCard
              key={entity.id}
              entity={entity}
              workflowCount={entityWorkflowCounts[entity.id] || 0}
              nodeDataCount={entityNodeCounts[entity.id] || 0}
              isRunning={runningEntity === entity.id}
              onSelect={setSelectedEntity}
              onRunWorkflows={handleRunWorkflows}
            />
          ))}
        </div>
      )}

      {/* Add Entity Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Entity</DialogTitle>
            <DialogDescription>
              Create a new entity to manage external platform workflows
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="entity-name">Name</Label>
              <Input
                id="entity-name"
                value={newEntity.name}
                onChange={(e) => setNewEntity((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., External CRM"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-slug">Slug</Label>
              <Input
                id="entity-slug"
                value={newEntity.slug}
                onChange={(e) => setNewEntity((prev) => ({ ...prev, slug: e.target.value }))}
                placeholder="e.g., external-crm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-type">Type</Label>
              <Select
                value={newEntity.entity_type}
                onValueChange={(value: 'external_platform' | 'internal' | 'integration') =>
                  setNewEntity((prev) => ({ ...prev, entity_type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="external_platform">External Platform</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="integration">Integration</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity-description">Description</Label>
              <Textarea
                id="entity-description"
                value={newEntity.description}
                onChange={(e) => setNewEntity((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddEntity} disabled={isCreating}>
              {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Entity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
