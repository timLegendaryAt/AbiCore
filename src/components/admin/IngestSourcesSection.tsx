import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { 
  Download, 
  Plus, 
  Pencil, 
  Trash2, 
  RefreshCw,
  Save,
  X
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

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

interface IngestSourcesSectionProps {
  integrationId: string;
  integrationName: string;
  integrationColor: string;
}

export function IngestSourcesSection({ integrationId, integrationName, integrationColor }: IngestSourcesSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<IngestSource | null>(null);
  const [formData, setFormData] = useState({
    ingest_point_id: '',
    name: '',
    description: '',
    fields: '',
    is_active: true,
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: ingestSources = [], isLoading, refetch } = useQuery({
    queryKey: ['integration-ingest-sources', integrationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('integration_ingest_sources')
        .select('*')
        .eq('integration_id', integrationId)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return (data || []) as IngestSource[];
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase
        .from('integration_ingest_sources')
        .insert({
          integration_id: integrationId,
          ingest_point_id: data.ingest_point_id.toLowerCase().replace(/\s+/g, '_'),
          name: data.name,
          description: data.description || null,
          fields: data.fields.split(',').map(f => f.trim()).filter(Boolean),
          is_active: data.is_active,
          sort_order: ingestSources.length,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-ingest-sources'] });
      toast({ title: 'Success', description: 'Ingest source created' });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from('integration_ingest_sources')
        .update({
          name: data.name,
          description: data.description || null,
          fields: data.fields.split(',').map(f => f.trim()).filter(Boolean),
          is_active: data.is_active,
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-ingest-sources'] });
      toast({ title: 'Success', description: 'Ingest source updated' });
      handleCloseDialog();
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('integration_ingest_sources')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integration-ingest-sources'] });
      toast({ title: 'Success', description: 'Ingest source deleted' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  const handleOpenDialog = (source?: IngestSource) => {
    if (source) {
      setEditingSource(source);
      setFormData({
        ingest_point_id: source.ingest_point_id,
        name: source.name,
        description: source.description || '',
        fields: source.fields.join(', '),
        is_active: source.is_active,
      });
    } else {
      setEditingSource(null);
      setFormData({
        ingest_point_id: '',
        name: '',
        description: '',
        fields: '',
        is_active: true,
      });
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingSource(null);
    setFormData({
      ingest_point_id: '',
      name: '',
      description: '',
      fields: '',
      is_active: true,
    });
  };

  const handleSubmit = () => {
    if (!formData.name) {
      toast({ title: 'Error', description: 'Name is required', variant: 'destructive' });
      return;
    }
    
    if (editingSource) {
      updateMutation.mutate({ id: editingSource.id, data: formData });
    } else {
      if (!formData.ingest_point_id) {
        toast({ title: 'Error', description: 'Ingest Point ID is required', variant: 'destructive' });
        return;
      }
      createMutation.mutate(formData);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Ingest Sources
              </CardTitle>
              <CardDescription>
                Configure data entry points that appear in workflow Ingest nodes for {integrationName}
              </CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {ingestSources.length === 0 && !isLoading ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No ingest sources configured yet.
              </p>
            ) : (
              ingestSources.map(source => (
                <div 
                  key={source.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                  style={{ borderColor: source.is_active ? `${integrationColor}40` : undefined }}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{source.name}</p>
                      <Badge variant={source.is_active ? 'default' : 'secondary'}>
                        {source.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{source.description}</p>
                    {source.fields.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {source.fields.map((field: string) => (
                          <span key={field} className="text-xs px-1.5 py-0.5 rounded bg-muted">
                            {field}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handleOpenDialog(source)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => deleteMutation.mutate(source.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
            
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => handleOpenDialog()}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Ingest Source
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSource ? 'Edit Ingest Source' : 'Add Ingest Source'}
            </DialogTitle>
            <DialogDescription>
              Configure a data entry point for {integrationName}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {!editingSource && (
              <div className="space-y-2">
                <Label htmlFor="ingest_point_id">Ingest Point ID</Label>
                <Input
                  id="ingest_point_id"
                  placeholder="e.g., initial_submission"
                  value={formData.ingest_point_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, ingest_point_id: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Unique identifier (will be converted to snake_case)
                </p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                placeholder="e.g., Initial Submission"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe what data this source provides..."
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fields">Data Fields</Label>
              <Input
                id="fields"
                placeholder="company_data, intake_submissions, intake_fields"
                value={formData.fields}
                onChange={(e) => setFormData(prev => ({ ...prev, fields: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of available data fields
              </p>
            </div>
            
            <div className="flex items-center justify-between">
              <Label htmlFor="is_active">Active</Label>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {editingSource ? 'Save Changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
