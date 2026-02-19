import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { triggerSchemaSync } from '@/lib/schemaSync';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Plus, ChevronRight, GripVertical, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FieldDefinitionCard } from './FieldDefinitionCard';
import { FieldDefinitionDialog } from './FieldDefinitionDialog';

interface DomainDefinition {
  domain: string;
  display_name: string;
  description: string | null;
  icon_name: string | null;
  color: string | null;
  sort_order: number | null;
}

interface FieldDefinition {
  id: string;
  field_key: string;
  display_name: string;
  description: string | null;
  field_type: string;
  domain: string;
  level: string | null;
  parent_field_id: string | null;
  is_scored: boolean | null;
  evaluation_method: string | null;
  evaluation_config: any | null;
  score_weight: number | null;
  sort_order: number | null;
  is_required: boolean | null;
  semantic_description: string | null;
  semantic_tags: string[] | null;
  importance_score: number | null;
  is_primary_score: boolean | null;
  is_primary_description: boolean | null;
}

interface FieldNode extends FieldDefinition {
  children: FieldNode[];
}

export function MasterSchemaTab() {
  const [domains, setDomains] = useState<DomainDefinition[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [domainsRes, fieldsRes] = await Promise.all([
        supabase
          .from('company_domain_definitions')
          .select('*')
          .order('sort_order'),
        supabase
          .from('company_field_definitions')
          .select('*')
          .order('sort_order'),
      ]);

      if (domainsRes.error) throw domainsRes.error;
      if (fieldsRes.error) throw fieldsRes.error;

      setDomains(domainsRes.data || []);
      setFields(fieldsRes.data || []);
    } catch (error) {
      console.error('Error fetching schema data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load schema data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Build hierarchy tree for a domain
  const buildHierarchy = (domain: string): FieldNode[] => {
    const domainFields = fields.filter(f => f.domain === domain);
    
    // Get root fields (L1, L1C, or L2 level, no parent)
    const roots = domainFields.filter(f => 
      (f.level === 'L1' || f.level === 'L2' || f.level === 'L1C') && !f.parent_field_id
    );
    
    // Sort with L1 first, then L1C, then L2, then by sort_order
    roots.sort((a, b) => {
      const levelOrder: Record<string, number> = { 'L1': 0, 'L1C': 1, 'L2': 2 };
      const aOrder = levelOrder[a.level || 'L2'] ?? 2;
      const bOrder = levelOrder[b.level || 'L2'] ?? 2;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    
    const buildChildren = (parentId: string): FieldNode[] => {
      const children = domainFields.filter(f => f.parent_field_id === parentId);
      return children.map(child => ({
        ...child,
        children: buildChildren(child.id),
      }));
    };

    return roots.map(root => ({
      ...root,
      children: buildChildren(root.id),
    }));
  };

  const handleAddField = (domain?: string, parentId?: string) => {
    setEditingField(null);
    setSelectedDomain(domain || null);
    setSelectedParentId(parentId || null);
    setDialogOpen(true);
  };

  const handleEditField = (field: FieldDefinition) => {
    setEditingField(field);
    setSelectedDomain(field.domain);
    setSelectedParentId(field.parent_field_id);
    setDialogOpen(true);
  };

  const handleDeleteField = async (fieldId: string, fieldKey: string, fieldDomain: string) => {
    // Check for children
    const hasChildren = fields.some(f => f.parent_field_id === fieldId);
    if (hasChildren) {
      toast({
        title: 'Cannot delete',
        description: 'This field has child fields. Delete them first.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('company_field_definitions')
        .delete()
        .eq('id', fieldId);

      if (error) throw error;

      toast({ title: 'Field deleted' });
      
      // Trigger schema sync (non-blocking)
      triggerSchemaSync('field_deleted', {
        type: 'field',
        operation: 'delete',
        key: fieldKey,
        domain: fieldDomain,
      });
      
      fetchData();
    } catch (error) {
      console.error('Error deleting field:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete field',
        variant: 'destructive',
      });
    }
  };

  const handleManualSchemaSync = async () => {
    setSyncing(true);
    try {
      const result = await triggerSchemaSync('manual');
      if (result.success) {
        toast({ title: 'Schema synced to Abi' });
      } else {
        toast({
          title: 'Sync failed',
          description: result.error || 'Unknown error',
          variant: 'destructive',
        });
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingField(null);
    setSelectedDomain(null);
    setSelectedParentId(null);
  };

  const handleFieldSaved = () => {
    handleDialogClose();
    fetchData();
  };

  const countFieldsInDomain = (domain: string) => {
    return fields.filter(f => f.domain === domain).length;
  };

  const renderFieldTree = (nodes: FieldNode[], depth: number = 0) => {
    return nodes.map(node => (
      <div key={node.id} className="space-y-1">
        <FieldDefinitionCard
          field={node}
          depth={depth}
          onEdit={() => handleEditField(node)}
          onDelete={() => handleDeleteField(node.id, node.field_key, node.domain)}
          onAddChild={() => handleAddField(node.domain, node.id)}
          hasChildren={node.children.length > 0}
        />
        {node.children.length > 0 && (
          <div className="ml-4 border-l border-border pl-2">
            {renderFieldTree(node.children, depth + 1)}
          </div>
        )}
      </div>
    ));
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="h-20" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Define the L2/L3/L4 field hierarchy that applies to all companies
        </p>
        <div className="flex items-center gap-2">
          <Button 
            onClick={handleManualSchemaSync} 
            size="sm" 
            variant="outline"
            disabled={syncing}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", syncing && "animate-spin")} />
            Sync Schema
          </Button>
          <Button onClick={() => handleAddField()} size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Field
          </Button>
        </div>
      </div>

      <Accordion type="multiple" className="space-y-2">
        {domains.map(domain => {
          const hierarchy = buildHierarchy(domain.domain);
          const fieldCount = countFieldsInDomain(domain.domain);

          return (
            <AccordionItem
              key={domain.domain}
              value={domain.domain}
              className="border rounded-lg bg-card"
            >
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3 flex-1">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: domain.color || 'hsl(var(--muted))' }}
                  />
                  <span className="font-medium">{domain.display_name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {fieldCount} fields
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="space-y-2">
                  {hierarchy.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <p className="text-sm">No fields defined for this domain</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => handleAddField(domain.domain)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add L2 Field
                      </Button>
                    </div>
                  ) : (
                    <>
                      {renderFieldTree(hierarchy)}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-muted-foreground"
                        onClick={() => handleAddField(domain.domain)}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add L2 Field
                      </Button>
                    </>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      <FieldDefinitionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        field={editingField}
        domains={domains}
        fields={fields}
        defaultDomain={selectedDomain}
        defaultParentId={selectedParentId}
        onSave={handleFieldSaved}
        onClose={handleDialogClose}
      />
    </div>
  );
}
