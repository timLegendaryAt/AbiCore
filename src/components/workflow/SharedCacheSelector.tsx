import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HardDrive, Plus } from 'lucide-react';
import { SharedCache } from '@/types/workflow';

interface SharedCacheSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  caches: SharedCache[];
  onSelect: (cacheId: string, cacheName: string) => void;
  onCreateNew: () => void;
}

const CACHE_COLOR = '#8b5cf6'; // violet-500

export function SharedCacheSelector({
  open,
  onOpenChange,
  caches,
  onSelect,
  onCreateNew,
}: SharedCacheSelectorProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-violet-500" />
            Select Shared Cache
          </DialogTitle>
          <DialogDescription>
            Choose a shared cache to write this node's output to.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-2 mt-4">
          {/* Create New option */}
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto py-3 border-dashed"
            onClick={() => {
              onOpenChange(false);
              onCreateNew();
            }}
          >
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center border-2 border-dashed"
              style={{ borderColor: CACHE_COLOR }}
            >
              <Plus className="w-4 h-4" style={{ color: CACHE_COLOR }} />
            </div>
            <div className="text-left">
              <div className="font-medium">Create New Cache</div>
              <div className="text-xs text-muted-foreground">
                Create a new shared cache for this output
              </div>
            </div>
          </Button>
          
          {caches.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No shared caches available. Create one to get started.
            </p>
          ) : (
            caches.map((cache) => (
              <Button
                key={cache.id}
                variant="outline"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => {
                  onSelect(cache.id, cache.name);
                  onOpenChange(false);
                }}
              >
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${CACHE_COLOR}20` }}
                >
                  <HardDrive className="w-4 h-4" style={{ color: CACHE_COLOR }} />
                </div>
                <div className="text-left">
                  <div className="font-medium">{cache.name}</div>
                  {cache.description && (
                    <div className="text-xs text-muted-foreground">
                      {cache.description}
                    </div>
                  )}
                </div>
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
