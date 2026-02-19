import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Entity } from '@/types/entity';
import { Building2, Play, Settings, Database, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface EntityCardProps {
  entity: Entity;
  workflowCount: number;
  nodeDataCount: number;
  isRunning?: boolean;
  onSelect: (entity: Entity) => void;
  onRunWorkflows: (entityId: string) => void;
  onSettings?: (entity: Entity) => void;
}

export function EntityCard({
  entity,
  workflowCount,
  nodeDataCount,
  isRunning = false,
  onSelect,
  onRunWorkflows,
  onSettings,
}: EntityCardProps) {
  const getEntityTypeLabel = (type: string) => {
    switch (type) {
      case 'external_platform':
        return 'External Platform';
      case 'internal':
        return 'Internal';
      case 'integration':
        return 'Integration';
      default:
        return type;
    }
  };

  return (
    <Card
      className="cursor-pointer hover:border-primary transition-colors"
      onClick={() => onSelect(entity)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: entity.color || 'hsl(var(--muted))' }}
            >
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base">{entity.name}</CardTitle>
              <CardDescription className="text-sm">
                {entity.description || 'No description'}
              </CardDescription>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onSettings?.(entity);
                }}
              >
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <Badge variant="secondary">{getEntityTypeLabel(entity.entity_type)}</Badge>
            <div className="flex items-center gap-1">
              <Database className="h-3.5 w-3.5" />
              <span>{workflowCount} workflow(s)</span>
            </div>
            {nodeDataCount > 0 && (
              <span className="text-xs">{nodeDataCount} node outputs</span>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onRunWorkflows(entity.id);
            }}
            disabled={isRunning || workflowCount === 0}
          >
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Play className="mr-1 h-3.5 w-3.5" />
                Run
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
