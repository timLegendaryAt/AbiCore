import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Check, X, Plus, AlertTriangle, ExternalLink, Loader2, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Discrepancy {
  modelId: string;
  modelName: string;
  field: string;
  oldValue: string | number;
  newValue: string | number;
  source?: string;
}

interface NewModel {
  id: string;
  displayName: string;
  provider: string;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  source?: string;
}

interface VerificationResult {
  matches: string[];
  discrepancies: Discrepancy[];
  newModels: NewModel[];
  deprecatedModels: string[];
  errors: string[];
  citations: string[];
}

interface ModelDiscrepancyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: VerificationResult;
  citations: string[];
  onApplied?: () => void;
}

export function ModelDiscrepancyDialog({
  open,
  onOpenChange,
  result,
  citations,
  onApplied,
}: ModelDiscrepancyDialogProps) {
  const { toast } = useToast();
  const [approvedChanges, setApprovedChanges] = useState<Set<string>>(new Set());
  const [approvedNewModels, setApprovedNewModels] = useState<Set<string>>(new Set());
  const [isApplying, setIsApplying] = useState(false);
  const [customEdits, setCustomEdits] = useState<Record<string, number>>({});

  const formatField = (field: string): string => {
    const fieldNames: Record<string, string> = {
      inputCostPerMillion: 'Input Cost',
      outputCostPerMillion: 'Output Cost',
      contextWindow: 'Context Window',
      maxOutputTokens: 'Max Output Tokens',
    };
    return fieldNames[field] || field;
  };

  const formatValue = (field: string, value: string | number): string => {
    if (field.includes('Cost')) {
      return `$${Number(value).toFixed(2)}/1M`;
    }
    if (field === 'contextWindow' || field === 'maxOutputTokens') {
      return `${Number(value).toLocaleString()} tokens`;
    }
    return String(value);
  };

  const toggleChange = (key: string) => {
    setApprovedChanges(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleNewModel = (modelId: string) => {
    setApprovedNewModels(prev => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  const handleApplySelected = async () => {
    setIsApplying(true);
    try {
      const approvedDiscrepancies = result.discrepancies.filter(d => 
        approvedChanges.has(`${d.modelId}:${d.field}`)
      );

      // Group discrepancies by model to build upsert records
      const overridesByModel: Record<string, {
        model_id: string;
        input_cost_per_million?: number;
        output_cost_per_million?: number;
        context_window?: number;
        max_output_tokens?: number;
        source_citation?: string;
      }> = {};

      for (const d of approvedDiscrepancies) {
        if (!overridesByModel[d.modelId]) {
          overridesByModel[d.modelId] = { model_id: d.modelId };
        }
        
        const fieldMap: Record<string, string> = {
          inputCostPerMillion: 'input_cost_per_million',
          outputCostPerMillion: 'output_cost_per_million',
          contextWindow: 'context_window',
          maxOutputTokens: 'max_output_tokens',
        };
        
        const dbField = fieldMap[d.field];
        if (dbField) {
          // Use custom edit if available, otherwise use the researched value
          const key = `${d.modelId}:${d.field}`;
          const value = customEdits[key] ?? d.newValue;
          (overridesByModel[d.modelId] as any)[dbField] = value;
        }
      }

      // Add citation from first source if available
      const citation = citations.length > 0 ? citations.slice(0, 3).join(', ') : undefined;
      Object.values(overridesByModel).forEach(o => {
        if (citation) o.source_citation = citation;
      });

      const overrides = Object.values(overridesByModel);

      if (overrides.length > 0) {
        const { error } = await supabase
          .from('model_pricing_overrides')
          .upsert(overrides, { onConflict: 'model_id' });

        if (error) throw error;
      }

      // Clear pending changes from app_settings
      const { data: existingSettings } = await supabase
        .from('app_settings')
        .select('model_verification_settings')
        .limit(1)
        .maybeSingle();

      if (existingSettings?.model_verification_settings) {
        const settings = existingSettings.model_verification_settings as any;
        await supabase
          .from('app_settings')
          .update({
            model_verification_settings: {
              ...settings,
              pending_changes: null,
            },
          })
          .not('id', 'is', null);
      }

      // Resolve the verification alert
      await supabase
        .from('system_alerts')
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq('alert_type', 'model_verification')
        .eq('is_resolved', false);

      toast({
        title: 'Changes Applied',
        description: `${overrides.length} model pricing override${overrides.length !== 1 ? 's' : ''} saved. Costs will update across the site.`,
      });

      onOpenChange(false);
      onApplied?.();
    } catch (error) {
      console.error('Error applying changes:', error);
      toast({
        title: 'Error',
        description: 'Failed to apply changes. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleDismiss = async () => {
    try {
      // Clear pending changes when dismissed
      const { data: existingSettings } = await supabase
        .from('app_settings')
        .select('model_verification_settings')
        .limit(1)
        .maybeSingle();

      if (existingSettings?.model_verification_settings) {
        const settings = existingSettings.model_verification_settings as any;
        await supabase
          .from('app_settings')
          .update({
            model_verification_settings: {
              ...settings,
              pending_changes: null,
            },
          })
          .not('id', 'is', null);
      }

      // Resolve the alert
      await supabase
        .from('system_alerts')
        .update({ is_resolved: true, resolved_at: new Date().toISOString() })
        .eq('alert_type', 'model_verification')
        .eq('is_resolved', false);
    } catch (error) {
      console.error('Error dismissing:', error);
    }
    
    onOpenChange(false);
  };

  const groupedDiscrepancies = result.discrepancies.reduce((acc, d) => {
    if (!acc[d.modelId]) {
      acc[d.modelId] = { name: d.modelName, changes: [] };
    }
    acc[d.modelId].changes.push(d);
    return acc;
  }, {} as Record<string, { name: string; changes: Discrepancy[] }>);

  const totalChanges = result.discrepancies.length + result.newModels.length + result.deprecatedModels.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Model Data Changes Detected
          </DialogTitle>
          <DialogDescription>
            Found {totalChanges} change{totalChanges !== 1 ? 's' : ''} requiring review.
            Select which changes to apply to update pricing across the site.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-4">
            {/* Discrepancies */}
            {Object.entries(groupedDiscrepancies).map(([modelId, { name, changes }]) => (
              <Card key={modelId} className="border-border/50">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium">{name}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0 space-y-2">
                {changes.map((change) => {
                    const key = `${change.modelId}:${change.field}`;
                    const isApproved = approvedChanges.has(key);
                    const isCostField = change.field.includes('Cost');
                    const isTokenField = change.field === 'contextWindow' || change.field === 'maxOutputTokens';
                    const currentValue = customEdits[key] ?? Number(change.newValue);
                    
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between py-2 border-b border-border/30 last:border-0 gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-muted-foreground">
                            {formatField(change.field)}:
                          </span>
                          <span className="ml-2 text-sm line-through text-muted-foreground">
                            {formatValue(change.field, change.oldValue)}
                          </span>
                          <span className="mx-2 text-muted-foreground">→</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isCostField && (
                            <div className="flex items-center gap-1">
                              <span className="text-sm text-muted-foreground">$</span>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={currentValue}
                                onChange={(e) => setCustomEdits(prev => ({
                                  ...prev,
                                  [key]: parseFloat(e.target.value) || 0
                                }))}
                                className="w-20 h-7 text-sm"
                              />
                              <span className="text-xs text-muted-foreground">/1M</span>
                            </div>
                          )}
                          {isTokenField && (
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              value={currentValue}
                              onChange={(e) => setCustomEdits(prev => ({
                                ...prev,
                                [key]: parseInt(e.target.value) || 0
                              }))}
                              className="w-28 h-7 text-sm"
                            />
                          )}
                          {!isCostField && !isTokenField && (
                            <span className="text-sm font-medium">
                              {formatValue(change.field, change.newValue)}
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant={isApproved ? 'default' : 'outline'}
                            className="h-7 px-2"
                            onClick={() => toggleChange(key)}
                          >
                            {isApproved ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              'Approve'
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}

            {/* New Models */}
            {result.newModels.length > 0 && (
              <Card className="border-green-500/30 bg-green-500/5">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Plus className="h-4 w-4 text-green-500" />
                    New Models Found
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0 space-y-2">
                  <p className="text-xs text-muted-foreground mb-2">
                    New models require code updates. Copy details to request addition.
                  </p>
                  {result.newModels.map((model) => {
                    const isApproved = approvedNewModels.has(model.id);
                    
                    return (
                      <div
                        key={model.id}
                        className="flex items-center justify-between py-2 border-b border-border/30 last:border-0"
                      >
                        <div className="flex-1">
                          <div className="text-sm font-medium">{model.displayName}</div>
                          <div className="text-xs text-muted-foreground">
                            {model.id}
                            {model.inputCostPerMillion && (
                              <span className="ml-2">
                                ${model.inputCostPerMillion}/${model.outputCostPerMillion} per 1M
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant="outline" className="mr-2">{model.provider}</Badge>
                        <Button
                          size="sm"
                          variant={isApproved ? 'default' : 'outline'}
                          className="h-7 px-2"
                          onClick={() => toggleNewModel(model.id)}
                        >
                          {isApproved ? <Check className="h-3 w-3" /> : 'Note'}
                        </Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Deprecated Models */}
            {result.deprecatedModels.length > 0 && (
              <Card className="border-red-500/30 bg-red-500/5">
                <CardHeader className="py-3 px-4">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <X className="h-4 w-4 text-red-500" />
                    Potentially Deprecated
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3 pt-0">
                  <div className="text-sm text-muted-foreground">
                    These models were not found in current documentation:
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {result.deprecatedModels.map((modelId) => (
                      <Badge key={modelId} variant="secondary" className="text-xs">
                        {modelId}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Citations */}
            {citations.length > 0 && (
              <div className="pt-2">
                <div className="text-xs text-muted-foreground mb-1">Sources:</div>
                <div className="flex flex-wrap gap-2">
                  {citations.slice(0, 5).map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {new URL(url).hostname}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleDismiss}>
            Dismiss All
          </Button>
          <Button
            onClick={handleApplySelected}
            disabled={approvedChanges.size === 0 || isApplying}
          >
            {isApplying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              `Apply Selected (${approvedChanges.size})`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
