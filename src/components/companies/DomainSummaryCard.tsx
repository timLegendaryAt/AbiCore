import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScoreBadge } from './ScoreBadge';
import { cn } from '@/lib/utils';

interface L1FieldData {
  field_key: string;
  field_value: unknown;
  display_name: string;
}

interface DomainSummaryCardProps {
  score: number | null;
  scoreDescription: string | null;
  scoreReasoning: string | null;
  domainDescription: string | null;
  className?: string;
}

export function DomainSummaryCard({
  score,
  scoreDescription,
  scoreReasoning,
  domainDescription,
  className,
}: DomainSummaryCardProps) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  
  // Don't render if no L1 data is available
  if (score === null && !scoreDescription && !scoreReasoning && !domainDescription) {
    return null;
  }

  return (
    <div className={cn(
      'rounded-lg border bg-gradient-to-r from-purple-50/50 to-indigo-50/50 dark:from-purple-950/20 dark:to-indigo-950/20 p-4 space-y-3',
      className
    )}>
      {/* Score Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {score !== null && (
            <div className="flex items-center gap-2">
              <ScoreBadge score={score} showLabel className="text-base px-3 py-1" />
              {scoreDescription && (
                <span className="text-sm font-medium text-muted-foreground">
                  {scoreDescription}
                </span>
              )}
            </div>
          )}
        </div>
        <Badge variant="outline" className="text-xs bg-purple-100/50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800">
          L1
        </Badge>
      </div>

      {/* Domain Description */}
      {domainDescription && (
        <p className="text-sm text-foreground/80 leading-relaxed">
          {domainDescription}
        </p>
      )}

      {/* Score Reasoning (Collapsible) */}
      {scoreReasoning && (
        <Collapsible open={reasoningOpen} onOpenChange={setReasoningOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1.5">
              {reasoningOpen ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  Hide Score Reasoning
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  View Score Reasoning
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 p-3 rounded-md bg-background/60 border border-border/50">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {scoreReasoning}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
