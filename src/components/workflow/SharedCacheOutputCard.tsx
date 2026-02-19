import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { X, HardDrive } from 'lucide-react';
import { SharedCache, SharedCacheOutputDestination } from '@/types/workflow';

interface SharedCacheOutputCardProps {
  cache: SharedCache | undefined;
  config: SharedCacheOutputDestination;
  onUpdate: (updates: Partial<SharedCacheOutputDestination>) => void;
  onRemove: () => void;
}

const CACHE_COLOR = '#8b5cf6'; // violet-500

export function SharedCacheOutputCard({
  cache,
  config,
  onUpdate,
  onRemove,
}: SharedCacheOutputCardProps) {
  const isEnabled = config.enabled;
  const displayName = cache?.name || config.shared_cache_name || 'Unknown Cache';

  return (
    <div 
      className="border rounded-lg overflow-hidden"
      style={{ borderColor: `${CACHE_COLOR}30` }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3"
        style={{ backgroundColor: `${CACHE_COLOR}10` }}
      >
        <div className="flex items-center gap-2">
          <div 
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: CACHE_COLOR }}
          />
          <HardDrive className="w-4 h-4" style={{ color: CACHE_COLOR }} />
          <span className="font-medium text-sm">{displayName}</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch 
            checked={isEnabled}
            onCheckedChange={(checked) => onUpdate({ enabled: checked })}
          />
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6"
            onClick={onRemove}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isEnabled && (
        <div className="p-3 space-y-2 border-t" style={{ borderColor: `${CACHE_COLOR}20` }}>
          <p className="text-xs text-muted-foreground">
            This node's output will be written to the shared cache when executed.
          </p>
          {cache?.description && (
            <p className="text-xs text-muted-foreground italic">
              {cache.description}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
