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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { MODEL_REGISTRY, formatCost, formatTokenCount } from '@/lib/modelRegistry';
import { invalidateModelOverrideCache } from '@/hooks/useModelPricing';

interface ManualOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied?: () => void;
}

export function ManualOverrideDialog({
  open,
  onOpenChange,
  onApplied,
}: ManualOverrideDialogProps) {
  const { toast } = useToast();
  const [selectedModelId, setSelectedModelId] = useState<string>('');
  const [inputCost, setInputCost] = useState<string>('');
  const [outputCost, setOutputCost] = useState<string>('');
  const [contextWindow, setContextWindow] = useState<string>('');
  const [maxOutputTokens, setMaxOutputTokens] = useState<string>('');
  const [isApplying, setIsApplying] = useState(false);

  const selectedModel = MODEL_REGISTRY.find(m => m.id === selectedModelId);

  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
    const model = MODEL_REGISTRY.find(m => m.id === modelId);
    if (model) {
      setInputCost(model.inputCostPerMillion.toString());
      setOutputCost(model.outputCostPerMillion.toString());
      setContextWindow(model.contextWindow.toString());
      setMaxOutputTokens(model.maxOutputTokens.toString());
    }
  };

  const handleApply = async () => {
    if (!selectedModelId) {
      toast({
        title: 'Error',
        description: 'Please select a model.',
        variant: 'destructive',
      });
      return;
    }

    setIsApplying(true);
    try {
      const override: {
        model_id: string;
        input_cost_per_million?: number;
        output_cost_per_million?: number;
        context_window?: number;
        max_output_tokens?: number;
        source_citation?: string;
      } = {
        model_id: selectedModelId,
        source_citation: 'Manual override',
      };

      if (inputCost) override.input_cost_per_million = parseFloat(inputCost);
      if (outputCost) override.output_cost_per_million = parseFloat(outputCost);
      if (contextWindow) override.context_window = parseInt(contextWindow);
      if (maxOutputTokens) override.max_output_tokens = parseInt(maxOutputTokens);

      const { error } = await supabase
        .from('model_pricing_overrides')
        .upsert(override, { onConflict: 'model_id' });

      if (error) throw error;

      // Invalidate cache so changes are reflected immediately
      invalidateModelOverrideCache();

      toast({
        title: 'Override Applied',
        description: `Pricing override saved for ${selectedModel?.displayName || selectedModelId}. Changes will affect future cost calculations.`,
      });

      // Reset form
      setSelectedModelId('');
      setInputCost('');
      setOutputCost('');
      setContextWindow('');
      setMaxOutputTokens('');
      
      onOpenChange(false);
      onApplied?.();
    } catch (error) {
      console.error('Error applying override:', error);
      toast({
        title: 'Error',
        description: 'Failed to apply override. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Manual Override</DialogTitle>
          <DialogDescription>
            Override model pricing or specifications. Changes will affect all future cost calculations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Model</Label>
            <Select value={selectedModelId} onValueChange={handleModelSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a model..." />
              </SelectTrigger>
              <SelectContent>
                {MODEL_REGISTRY.map(model => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedModel && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="inputCost">Input Cost ($/1M tokens)</Label>
                  <Input
                    id="inputCost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={inputCost}
                    onChange={(e) => setInputCost(e.target.value)}
                    placeholder={selectedModel.inputCostPerMillion.toString()}
                  />
                  <p className="text-xs text-muted-foreground">
                    Current: {formatCost(selectedModel.inputCostPerMillion)}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="outputCost">Output Cost ($/1M tokens)</Label>
                  <Input
                    id="outputCost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={outputCost}
                    onChange={(e) => setOutputCost(e.target.value)}
                    placeholder={selectedModel.outputCostPerMillion.toString()}
                  />
                  <p className="text-xs text-muted-foreground">
                    Current: {formatCost(selectedModel.outputCostPerMillion)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contextWindow">Context Window</Label>
                  <Input
                    id="contextWindow"
                    type="number"
                    step="1000"
                    min="0"
                    value={contextWindow}
                    onChange={(e) => setContextWindow(e.target.value)}
                    placeholder={selectedModel.contextWindow.toString()}
                  />
                  <p className="text-xs text-muted-foreground">
                    Current: {formatTokenCount(selectedModel.contextWindow)}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxOutputTokens">Max Output Tokens</Label>
                  <Input
                    id="maxOutputTokens"
                    type="number"
                    step="1000"
                    min="0"
                    value={maxOutputTokens}
                    onChange={(e) => setMaxOutputTokens(e.target.value)}
                    placeholder={selectedModel.maxOutputTokens.toString()}
                  />
                  <p className="text-xs text-muted-foreground">
                    Current: {formatTokenCount(selectedModel.maxOutputTokens)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!selectedModelId || isApplying}>
            {isApplying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              'Apply Override'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
