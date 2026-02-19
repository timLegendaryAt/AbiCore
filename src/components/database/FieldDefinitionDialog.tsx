import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { triggerSchemaSync } from '@/lib/schemaSync';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { AlertCircle } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type CompanyDomain = Database['public']['Enums']['company_domain'];
type SSOTLevel = Database['public']['Enums']['ssot_level'];
import { Alert, AlertDescription } from '@/components/ui/alert';

interface DomainDefinition {
  domain: string;
  display_name: string;
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

interface FieldDefinitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  field: FieldDefinition | null;
  domains: DomainDefinition[];
  fields: FieldDefinition[];
  defaultDomain: string | null;
  defaultParentId: string | null;
  onSave: () => void;
  onClose: () => void;
}

const fieldTypes = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'url', label: 'URL' },
  { value: 'array', label: 'Array' },
  { value: 'json', label: 'JSON' },
];

const evaluationMethods = [
  { value: 'ai_assessment', label: 'AI Assessment' },
  { value: 'numeric_range', label: 'Numeric Range' },
  { value: 'boolean_check', label: 'Boolean Check' },
  { value: 'existence_check', label: 'Existence Check' },
  { value: 'weighted_aggregate', label: 'Weighted Aggregate' },
];

export function FieldDefinitionDialog({
  open,
  onOpenChange,
  field,
  domains,
  fields,
  defaultDomain,
  defaultParentId,
  onSave,
  onClose,
}: FieldDefinitionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    field_key: '',
    display_name: '',
    description: '',
    field_type: 'text',
    domain: '',
    level: 'L2',
    parent_field_id: '',
    is_scored: false,
    evaluation_method: '',
    score_weight: 1,
    semantic_description: '',
    semantic_tags: '',
    importance_score: 50,
    is_primary_score: false,
    is_primary_description: false,
  });
  const [validationError, setValidationError] = useState<string | null>(null);
  const { toast } = useToast();

  const isEditing = !!field;

  useEffect(() => {
    if (field) {
      setFormData({
        field_key: field.field_key,
        display_name: field.display_name,
        description: field.description || '',
        field_type: field.field_type,
        domain: field.domain,
        level: field.level || 'L4',
        parent_field_id: field.parent_field_id || '',
        is_scored: field.is_scored || false,
        evaluation_method: field.evaluation_method || '',
        score_weight: field.score_weight || 1,
        semantic_description: field.semantic_description || '',
        semantic_tags: field.semantic_tags?.join(', ') || '',
        importance_score: field.importance_score || 50,
        is_primary_score: field.is_primary_score || false,
        is_primary_description: field.is_primary_description || false,
      });
    } else {
      // Determine level based on parent
      let level = 'L2';
      if (defaultParentId) {
        const parent = fields.find(f => f.id === defaultParentId);
        if (parent?.level === 'L2') level = 'L3';
        else if (parent?.level === 'L3') level = 'L4';
      }

      setFormData({
        field_key: '',
        display_name: '',
        description: '',
        field_type: 'text',
        domain: defaultDomain || (domains[0]?.domain || ''),
        level,
        parent_field_id: defaultParentId || '',
        is_scored: level === 'L2', // L2 must be scored
        evaluation_method: level === 'L2' ? 'ai_assessment' : '',
        score_weight: 1,
        semantic_description: '',
        semantic_tags: '',
        importance_score: 50,
        is_primary_score: false,
        is_primary_description: false,
      });
    }
    setValidationError(null);
  }, [field, defaultDomain, defaultParentId, domains, fields]);

  const validate = (): boolean => {
    // L4 cannot be scored
    if (formData.level === 'L4' && formData.is_scored) {
      setValidationError('L4 (Input) fields cannot be scored');
      return false;
    }

    // L1C cannot be scored
    if (formData.level === 'L1C' && formData.is_scored) {
      setValidationError('L1C (Context) fields cannot be scored');
      return false;
    }

    // L1 cannot be scored (they hold the score value itself)
    if (formData.level === 'L1' && formData.is_scored) {
      setValidationError('L1 (Domain Summary) fields cannot be scored');
      return false;
    }

    // L2 must be scored with evaluation method
    if (formData.level === 'L2' && !formData.is_scored) {
      setValidationError('L2 (Primary) fields must be scored');
      return false;
    }

    if (formData.level === 'L2' && !formData.evaluation_method) {
      setValidationError('L2 (Primary) fields require an evaluation method');
      return false;
    }

    // Parent validation
    if (formData.parent_field_id) {
      const parent = fields.find(f => f.id === formData.parent_field_id);
      if (parent) {
        if (formData.level === 'L3' && parent.level !== 'L2') {
          setValidationError('L3 fields must have an L2 parent');
          return false;
        }
        if (formData.level === 'L4' && parent.level !== 'L3') {
          setValidationError('L4 fields must have an L3 parent');
          return false;
        }
      }
    } else if (formData.level !== 'L2' && formData.level !== 'L1C' && formData.level !== 'L1') {
      setValidationError('L3 and L4 fields require a parent field');
      return false;
    }

    // Required fields
    if (!formData.field_key.trim()) {
      setValidationError('Field key is required');
      return false;
    }

    if (!formData.display_name.trim()) {
      setValidationError('Display name is required');
      return false;
    }

    if (!formData.domain) {
      setValidationError('Domain is required');
      return false;
    }

    setValidationError(null);
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const payload = {
        field_key: formData.field_key.trim(),
        display_name: formData.display_name.trim(),
        description: formData.description.trim() || null,
        field_type: formData.field_type,
        domain: formData.domain as CompanyDomain,
        level: formData.level as SSOTLevel,
        parent_field_id: formData.parent_field_id || null,
        is_scored: formData.is_scored,
        evaluation_method: formData.is_scored ? formData.evaluation_method : null,
        score_weight: formData.is_scored ? formData.score_weight : null,
        semantic_description: formData.semantic_description.trim() || null,
        semantic_tags: formData.semantic_tags
          ? formData.semantic_tags.split(',').map(t => t.trim()).filter(Boolean)
          : null,
        importance_score: formData.importance_score,
        is_primary_score: formData.level === 'L3' ? formData.is_primary_score : false,
        is_primary_description: formData.level === 'L3' ? formData.is_primary_description : false,
      };

      if (isEditing && field) {
        const { error } = await supabase
          .from('company_field_definitions')
          .update(payload)
          .eq('id', field.id);

        if (error) throw error;
        toast({ title: 'Field updated' });
        
        // Trigger schema sync (non-blocking)
        triggerSchemaSync('field_updated', {
          type: 'field',
          operation: 'update',
          key: payload.field_key,
          domain: payload.domain,
        });
      } else {
        const { error } = await supabase
          .from('company_field_definitions')
          .insert(payload);

        if (error) throw error;
        toast({ title: 'Field created' });
        
        // Trigger schema sync (non-blocking)
        triggerSchemaSync('field_created', {
          type: 'field',
          operation: 'create',
          key: payload.field_key,
          domain: payload.domain,
        });
      }

      onSave();
    } catch (error: any) {
      console.error('Error saving field:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save field',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Get available parents based on domain and level
  const getAvailableParents = () => {
    if (formData.level === 'L1' || formData.level === 'L2' || formData.level === 'L1C') return [];
    const parentLevel = formData.level === 'L3' ? 'L2' : 'L3';
    return fields.filter(
      f => f.domain === formData.domain && f.level === parentLevel
    );
  };

  const handleLevelChange = (level: string) => {
    setFormData(prev => ({
      ...prev,
      level,
      parent_field_id: (level === 'L1' || level === 'L2' || level === 'L1C') ? '' : prev.parent_field_id,
      is_scored: level === 'L2' ? true : (level === 'L1' || level === 'L4' || level === 'L1C') ? false : prev.is_scored,
      evaluation_method: level === 'L2' ? (prev.evaluation_method || 'ai_assessment') : (level === 'L1' || level === 'L4' || level === 'L1C') ? '' : prev.evaluation_method,
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Field Definition' : 'Add Field Definition'}</DialogTitle>
          <DialogDescription>
            {isEditing 
              ? 'Modify the field definition properties' 
              : 'Create a new field in the Master Schema'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}

          {/* Basic Information */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="field_key">Field Key *</Label>
              <Input
                id="field_key"
                value={formData.field_key}
                onChange={e => setFormData(prev => ({ ...prev, field_key: e.target.value }))}
                placeholder="e.g., ceo_name"
                disabled={isEditing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name *</Label>
              <Input
                id="display_name"
                value={formData.display_name}
                onChange={e => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                placeholder="e.g., CEO Name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Brief description of this field"
              rows={2}
            />
          </div>

          {/* Type & Domain */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Field Type</Label>
              <Select
                value={formData.field_type}
                onValueChange={v => setFormData(prev => ({ ...prev, field_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fieldTypes.map(t => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Domain *</Label>
              <Select
                value={formData.domain}
                onValueChange={v => setFormData(prev => ({ ...prev, domain: v, parent_field_id: '' }))}
                disabled={isEditing}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select domain" />
                </SelectTrigger>
                <SelectContent>
                  {domains.map(d => (
                    <SelectItem key={d.domain} value={d.domain}>
                      {d.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Hierarchy */}
          <Separator />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Level</Label>
              <Select
                value={formData.level}
                onValueChange={handleLevelChange}
                disabled={isEditing && !!defaultParentId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="L1">L1 - Domain Summary</SelectItem>
                  <SelectItem value="L1C">L1C - Context (Unscored)</SelectItem>
                  <SelectItem value="L2">L2 - Primary (Scored)</SelectItem>
                  <SelectItem value="L3">L3 - Driver</SelectItem>
                  <SelectItem value="L4">L4 - Input</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {formData.level !== 'L1' && formData.level !== 'L2' && formData.level !== 'L1C' && (
              <div className="space-y-2">
                <Label>Parent Field</Label>
                <Select
                  value={formData.parent_field_id}
                  onValueChange={v => setFormData(prev => ({ ...prev, parent_field_id: v }))}
                  disabled={!formData.domain}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select parent" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableParents().map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Scoring */}
          {formData.level !== 'L1' && formData.level !== 'L4' && formData.level !== 'L1C' && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Scored Field</Label>
                    <p className="text-xs text-muted-foreground">
                      {formData.level === 'L2' ? 'L2 fields are always scored' : 'Enable scoring for this field'}
                    </p>
                  </div>
                  <Switch
                    checked={formData.is_scored}
                    onCheckedChange={v => setFormData(prev => ({ ...prev, is_scored: v }))}
                    disabled={formData.level === 'L2'}
                  />
                </div>

                {formData.is_scored && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Evaluation Method</Label>
                      <Select
                        value={formData.evaluation_method}
                        onValueChange={v => setFormData(prev => ({ ...prev, evaluation_method: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent>
                          {evaluationMethods.map(m => (
                            <SelectItem key={m.value} value={m.value}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Score Weight</Label>
                      <Input
                        type="number"
                        value={formData.score_weight}
                        onChange={e => setFormData(prev => ({ ...prev, score_weight: parseFloat(e.target.value) || 1 }))}
                        min={0}
                        max={10}
                        step={0.1}
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Primary Display (L3 only) */}
          {formData.level === 'L3' && (
            <>
              <Separator />
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">Primary Display (for Abi)</Label>
                  <p className="text-xs text-muted-foreground">
                    Mark which L3 field should be used as the main display for its parent L2
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Primary Score</Label>
                    <p className="text-xs text-muted-foreground">
                      Use as the main score for this L2
                    </p>
                  </div>
                  <Switch
                    checked={formData.is_primary_score}
                    onCheckedChange={v => setFormData(prev => ({ ...prev, is_primary_score: v }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Primary Description</Label>
                    <p className="text-xs text-muted-foreground">
                      Use as the main description for this L2
                    </p>
                  </div>
                  <Switch
                    checked={formData.is_primary_description}
                    onCheckedChange={v => setFormData(prev => ({ ...prev, is_primary_description: v }))}
                  />
                </div>
              </div>
            </>
          )}

          {/* RAG/Semantic */}
          <Separator />
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="semantic_description">Semantic Description</Label>
              <Textarea
                id="semantic_description"
                value={formData.semantic_description}
                onChange={e => setFormData(prev => ({ ...prev, semantic_description: e.target.value }))}
                placeholder="Description for AI/RAG retrieval"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="semantic_tags">Semantic Tags</Label>
                <Input
                  id="semantic_tags"
                  value={formData.semantic_tags}
                  onChange={e => setFormData(prev => ({ ...prev, semantic_tags: e.target.value }))}
                  placeholder="comma, separated, tags"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="importance_score">Importance (0-100)</Label>
                <Input
                  id="importance_score"
                  type="number"
                  value={formData.importance_score}
                  onChange={e => setFormData(prev => ({ ...prev, importance_score: parseInt(e.target.value) || 50 }))}
                  min={0}
                  max={100}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : isEditing ? 'Update Field' : 'Create Field'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
