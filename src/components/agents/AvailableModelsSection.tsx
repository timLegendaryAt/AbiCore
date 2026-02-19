import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Info, Star, Globe, Image, Brain, Pencil, Plus } from 'lucide-react';
import { 
  LAST_UPDATED, 
  formatTokenCount, 
  formatCost,
} from '@/lib/modelRegistry';
import { useModelPricing } from '@/hooks/useModelPricing';
import { ManualOverrideDialog } from './ManualOverrideDialog';

interface EffectiveModelInfo {
  id: string;
  displayName: string;
  provider: 'google' | 'openai' | 'perplexity';
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
  capabilities: {
    webSearch: boolean;
    multimodal: boolean;
    reasoning: 'basic' | 'standard' | 'advanced';
  };
  recommended: boolean;
  hasOverride: boolean;
}

function ModelCard({ model }: { model: EffectiveModelInfo }) {
  const reasoningLabel = {
    basic: 'Basic',
    standard: 'Standard',
    advanced: 'Advanced',
  }[model.capabilities.reasoning];

  return (
    <div className="p-4 rounded-lg border bg-card space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold">{model.displayName}</h4>
            {model.recommended && (
              <Badge variant="default" className="gap-1 text-xs">
                <Star className="h-3 w-3" />
                Recommended
              </Badge>
            )}
            {model.hasOverride && (
              <Badge variant="outline" className="gap-1 text-xs border-amber-500 text-amber-600">
                <Pencil className="h-3 w-3" />
                Override
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{model.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Context</p>
          <p className="font-medium">{formatTokenCount(model.contextWindow)} tokens</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Max Output</p>
          <p className="font-medium">{formatTokenCount(model.maxOutputTokens)} tokens</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Input Cost</p>
          <p className="font-medium">{formatCost(model.inputCostPerMillion)}/1M</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Output Cost</p>
          <p className="font-medium">{formatCost(model.outputCostPerMillion)}/1M</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {model.capabilities.webSearch && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Globe className="h-3 w-3" />
            Web Search
          </Badge>
        )}
        {model.capabilities.multimodal && (
          <Badge variant="outline" className="gap-1 text-xs">
            <Image className="h-3 w-3" />
            Multimodal
          </Badge>
        )}
        <Badge variant="outline" className="gap-1 text-xs">
          <Brain className="h-3 w-3" />
          {reasoningLabel} Reasoning
        </Badge>
      </div>
    </div>
  );
}

function ProviderSection({ 
  provider, 
  title, 
  models 
}: { 
  provider: 'google' | 'openai' | 'perplexity'; 
  title: string; 
  models: EffectiveModelInfo[];
}) {
  const providerModels = models.filter(m => m.provider === provider);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{providerModels.length} models available</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {providerModels.map(model => (
          <ModelCard key={model.id} model={model} />
        ))}
      </CardContent>
    </Card>
  );
}

export function AvailableModelsSection() {
  const { models, isLoading, refresh } = useModelPricing();
  const [showManualOverride, setShowManualOverride] = useState(false);

  const formattedDate = new Date(LAST_UPDATED).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const overrideCount = models.filter(m => m.hasOverride).length;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <Skeleton className="h-6 w-32" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {overrideCount > 0 && (
            <Badge variant="outline" className="border-amber-500 text-amber-600">
              {overrideCount} override{overrideCount !== 1 ? 's' : ''} active
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowManualOverride(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Override
          </Button>
          <Badge variant="secondary" className="text-xs">
            Last verified: {formattedDate}
          </Badge>
        </div>
      </div>

      <div className="space-y-4">
        <ProviderSection provider="google" title="Google Gemini" models={models} />
        <ProviderSection provider="openai" title="OpenAI GPT" models={models} />
        <ProviderSection provider="perplexity" title="Perplexity Sonar" models={models} />
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Pricing is estimated and may vary. Models with overrides show custom pricing.
          Overrides affect all cost calculations and analytics.
        </AlertDescription>
      </Alert>

      <ManualOverrideDialog
        open={showManualOverride}
        onOpenChange={setShowManualOverride}
        onApplied={refresh}
      />
    </div>
  );
}

