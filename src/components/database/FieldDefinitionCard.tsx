import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Pencil, Trash2, Plus, Target, Hash, Type, Calendar, Link, List, Star, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
  score_weight: number | null;
  sort_order: number | null;
  is_primary_score?: boolean | null;
  is_primary_description?: boolean | null;
}

interface FieldDefinitionCardProps {
  field: FieldDefinition;
  depth: number;
  onEdit: () => void;
  onDelete: () => void;
  onAddChild: () => void;
  hasChildren: boolean;
}

const fieldTypeIcons: Record<string, typeof Type> = {
  text: Type,
  number: Hash,
  boolean: Target,
  date: Calendar,
  url: Link,
  array: List,
};

const levelColors: Record<string, string> = {
  L1: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  L1C: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  L2: 'bg-primary/10 text-primary',
  L3: 'bg-secondary/10 text-secondary-foreground',
  L4: 'bg-muted text-muted-foreground',
};

export function FieldDefinitionCard({
  field,
  depth,
  onEdit,
  onDelete,
  onAddChild,
  hasChildren,
}: FieldDefinitionCardProps) {
  const Icon = fieldTypeIcons[field.field_type] || Type;
  // L1 and L1C cannot have children, only L2 and L3 can
  const canAddChild = field.level === 'L2' || field.level === 'L3';
  const nextLevel = field.level === 'L2' ? 'L3' : field.level === 'L3' ? 'L4' : null;

  // Simplify field_key by removing parent prefix (e.g., "market_growth_score" -> "score")
  const getSimplifiedKey = (key: string) => {
    const parts = key.split('_');
    // If it has more than 2 parts and looks like it has a prefix, take last 1-2 parts
    if (parts.length > 2) {
      return parts.slice(-2).join('_');
    }
    return key;
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-2 py-1.5 px-2 rounded-md border bg-background hover:bg-muted/50 transition-colors',
        depth > 0 && 'ml-0'
      )}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-sm font-medium truncate">{field.display_name}</span>
        <Badge
          variant="outline"
          className={cn('text-[10px] px-1.5 py-0', levelColors[field.level || 'L4'])}
        >
          {field.level || 'L4'}
        </Badge>
        {field.is_scored && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            Scored
          </Badge>
        )}
        {field.is_primary_score && (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-600 dark:text-amber-400">
                <Star className="w-3 h-3 mr-0.5" />
                Score
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Primary score for this L2</TooltipContent>
          </Tooltip>
        )}
        {field.is_primary_description && (
          <Tooltip>
            <TooltipTrigger>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500 text-blue-600 dark:text-blue-400">
                <FileText className="w-3 h-3 mr-0.5" />
                Desc
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Primary description for this L2</TooltipContent>
          </Tooltip>
        )}
        <code className="text-[10px] text-muted-foreground bg-muted px-1 py-0 rounded">
          {getSimplifiedKey(field.field_key)}
        </code>
      </div>

      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {field.is_scored && field.score_weight && (
          <span className="text-xs text-muted-foreground mr-2">
            w: {field.score_weight}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
            {canAddChild && (
              <DropdownMenuItem onClick={onAddChild}>
                <Plus className="w-4 h-4 mr-2" />
                Add {nextLevel} Child
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className="text-destructive focus:text-destructive"
              disabled={hasChildren}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
