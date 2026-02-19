import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { triggerSchemaSync } from '@/lib/schemaSync';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreHorizontal, Pencil, Trash2, Info, Tag, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type CompanyDomain = Database['public']['Enums']['company_domain'];

interface ContextFactDefinition {
  id: string;
  fact_key: string;
  display_name: string;
  description: string | null;
  fact_type: string;
  category: string;
  icon_name: string | null;
  sort_order: number | null;
  default_domains: CompanyDomain[] | null;
  allowed_values: any | null;
  validation_rules: any | null;
}

interface DomainDefinition {
  domain: CompanyDomain;
  display_name: string;
}

const factTypes = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'select', label: 'Select (Single)' },
  { value: 'multi_select', label: 'Multi-Select' },
  { value: 'date', label: 'Date' },
];

const categories = [
  { value: 'attribute', label: 'Attribute', icon: Info },
  { value: 'constraint', label: 'Constraint', icon: AlertTriangle },
  { value: 'segment', label: 'Segment', icon: Tag },
];

export function ContextFactDefinitionsTab() {
  const [facts, setFacts] = useState<ContextFactDefinition[]>([]);
  const [domains, setDomains] = useState<DomainDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFact, setEditingFact] = useState<ContextFactDefinition | null>(null);
  const [formData, setFormData] = useState({
    fact_key: '',
    display_name: '',
    description: '',
    fact_type: 'text',
    category: 'attribute',
    icon_name: '',
    default_domains: [] as CompanyDomain[],
    allowed_values: '',
  });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [factsRes, domainsRes] = await Promise.all([
        supabase
          .from('context_fact_definitions')
          .select('*')
          .order('sort_order'),
        supabase
          .from('company_domain_definitions')
          .select('domain, display_name')
          .order('sort_order'),
      ]);

      if (factsRes.error) throw factsRes.error;
      if (domainsRes.error) throw domainsRes.error;

      setFacts(factsRes.data || []);
      setDomains(domainsRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load context fact definitions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingFact(null);
    setFormData({
      fact_key: '',
      display_name: '',
      description: '',
      fact_type: 'text',
      category: 'attribute',
      icon_name: '',
      default_domains: [],
      allowed_values: '',
    });
    setDialogOpen(true);
  };

  const handleEdit = (fact: ContextFactDefinition) => {
    setEditingFact(fact);
    setFormData({
      fact_key: fact.fact_key,
      display_name: fact.display_name,
      description: fact.description || '',
      fact_type: fact.fact_type,
      category: fact.category,
      icon_name: fact.icon_name || '',
      default_domains: fact.default_domains || [],
      allowed_values: fact.allowed_values
        ? JSON.stringify(fact.allowed_values, null, 2)
        : '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string, factKey: string) => {
    try {
      const { error } = await supabase
        .from('context_fact_definitions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Context fact deleted' });
      
      // Trigger schema sync (non-blocking)
      triggerSchemaSync('context_fact_def_deleted', {
        type: 'context_fact_def',
        operation: 'delete',
        key: factKey,
      });
      
      fetchData();
    } catch (error) {
      console.error('Error deleting fact:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete context fact',
        variant: 'destructive',
      });
    }
  };

  const handleSave = async () => {
    if (!formData.fact_key.trim() || !formData.display_name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Fact key and display name are required',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      let allowedValues = null;
      if (formData.allowed_values.trim()) {
        try {
          allowedValues = JSON.parse(formData.allowed_values);
        } catch {
          toast({
            title: 'Validation Error',
            description: 'Allowed values must be valid JSON',
            variant: 'destructive',
          });
          return;
        }
      }

      const payload = {
        fact_key: formData.fact_key.trim(),
        display_name: formData.display_name.trim(),
        description: formData.description.trim() || null,
        fact_type: formData.fact_type,
        category: formData.category,
        icon_name: formData.icon_name.trim() || null,
        default_domains: formData.default_domains.length > 0 ? formData.default_domains : null,
        allowed_values: allowedValues,
      };

      if (editingFact) {
        const { error } = await supabase
          .from('context_fact_definitions')
          .update(payload)
          .eq('id', editingFact.id);

        if (error) throw error;
        toast({ title: 'Context fact updated' });
        
        // Trigger schema sync (non-blocking)
        triggerSchemaSync('context_fact_def_updated', {
          type: 'context_fact_def',
          operation: 'update',
          key: payload.fact_key,
        });
      } else {
        const { error } = await supabase
          .from('context_fact_definitions')
          .insert(payload);

        if (error) throw error;
        toast({ title: 'Context fact created' });
        
        // Trigger schema sync (non-blocking)
        triggerSchemaSync('context_fact_def_created', {
          type: 'context_fact_def',
          operation: 'create',
          key: payload.fact_key,
        });
      }

      setDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error saving fact:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save context fact',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleDomain = (domain: CompanyDomain) => {
    setFormData(prev => ({
      ...prev,
      default_domains: prev.default_domains.includes(domain)
        ? prev.default_domains.filter(d => d !== domain)
        : [...prev.default_domains, domain],
    }));
  };

  const getCategoryIcon = (category: string) => {
    const cat = categories.find(c => c.value === category);
    return cat?.icon || Info;
  };

  if (loading) {
    return (
      <Card className="animate-pulse">
        <CardHeader className="h-20" />
        <CardContent className="h-64" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Manage L1C context fact templates that apply across domains
        </p>
        <Button onClick={handleAdd} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Context Fact
        </Button>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fact Key</TableHead>
              <TableHead>Display Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Domains</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {facts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No context fact definitions yet
                </TableCell>
              </TableRow>
            ) : (
              facts.map(fact => {
                const CategoryIcon = getCategoryIcon(fact.category);
                return (
                  <TableRow key={fact.id}>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {fact.fact_key}
                      </code>
                    </TableCell>
                    <TableCell className="font-medium">{fact.display_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {fact.fact_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <CategoryIcon className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm capitalize">{fact.category}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {fact.default_domains?.length ? (
                        <div className="flex flex-wrap gap-1">
                          {fact.default_domains.slice(0, 3).map(d => (
                            <Badge key={d} variant="secondary" className="text-xs">
                              {domains.find(dom => dom.domain === d)?.display_name || d}
                            </Badge>
                          ))}
                          {fact.default_domains.length > 3 && (
                            <Badge variant="secondary" className="text-xs">
                              +{fact.default_domains.length - 3}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">All domains</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(fact)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(fact.id, fact.fact_key)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingFact ? 'Edit Context Fact' : 'Add Context Fact'}
            </DialogTitle>
            <DialogDescription>
              Context facts are unscored descriptive attributes relevant across domains
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="fact_key">Fact Key *</Label>
                <Input
                  id="fact_key"
                  value={formData.fact_key}
                  onChange={e => setFormData(prev => ({ ...prev, fact_key: e.target.value }))}
                  placeholder="e.g., industry_sector"
                  disabled={!!editingFact}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="display_name">Display Name *</Label>
                <Input
                  id="display_name"
                  value={formData.display_name}
                  onChange={e => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                  placeholder="e.g., Industry Sector"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="What this context fact represents"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fact Type</Label>
                <Select
                  value={formData.fact_type}
                  onValueChange={v => setFormData(prev => ({ ...prev, fact_type: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {factTypes.map(t => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={v => setFormData(prev => ({ ...prev, category: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(c => (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <c.icon className="w-4 h-4" />
                          {c.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Default Domains</Label>
              <div className="flex flex-wrap gap-2">
                {domains.map(d => (
                  <Badge
                    key={d.domain}
                    variant={formData.default_domains.includes(d.domain) ? 'default' : 'outline'}
                    className={cn(
                      'cursor-pointer transition-colors',
                      formData.default_domains.includes(d.domain) && 'bg-primary'
                    )}
                    onClick={() => toggleDomain(d.domain)}
                  >
                    {d.display_name}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty for this fact to appear in all domains
              </p>
            </div>

            {(formData.fact_type === 'select' || formData.fact_type === 'multi_select') && (
              <div className="space-y-2">
                <Label htmlFor="allowed_values">Allowed Values (JSON)</Label>
                <Textarea
                  id="allowed_values"
                  value={formData.allowed_values}
                  onChange={e => setFormData(prev => ({ ...prev, allowed_values: e.target.value }))}
                  placeholder='["Option 1", "Option 2", "Option 3"]'
                  rows={3}
                  className="font-mono text-sm"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="icon_name">Icon Name</Label>
              <Input
                id="icon_name"
                value={formData.icon_name}
                onChange={e => setFormData(prev => ({ ...prev, icon_name: e.target.value }))}
                placeholder="e.g., Building"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingFact ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
