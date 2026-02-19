import { Badge } from '@/components/ui/badge';
import { getScoreColor, getScoreLabel } from '@/types/company-master';
import { cn } from '@/lib/utils';

interface ScoreBadgeProps {
  score: number | null;
  confidence?: number | null;
  showLabel?: boolean;
  className?: string;
}

export function ScoreBadge({ score, confidence, showLabel = false, className }: ScoreBadgeProps) {
  if (score === null) {
    return (
      <Badge variant="outline" className={cn("text-xs opacity-50", className)}>
        —
      </Badge>
    );
  }

  const color = getScoreColor(score);
  const colorClasses: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800',
    green: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
    amber: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
    red: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
    muted: 'bg-muted text-muted-foreground',
  };

  return (
    <Badge 
      variant="outline" 
      className={cn("text-xs font-medium", colorClasses[color], className)}
    >
      {score}
      {showLabel && (
        <span className="ml-1 opacity-70">({getScoreLabel(score)})</span>
      )}
      {confidence !== undefined && confidence !== null && confidence < 0.7 && (
        <span className="ml-1 opacity-50">?</span>
      )}
    </Badge>
  );
}
