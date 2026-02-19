import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink, Database, Webhook } from 'lucide-react';
import { OutputDestination } from '@/types/workflow';

interface AddDestinationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  destinations: OutputDestination[];
  onSelect: (destinationId: string) => void;
}

export function AddDestinationDialog({
  open,
  onOpenChange,
  destinations,
  onSelect,
}: AddDestinationDialogProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case 'external_api':
        return ExternalLink;
      case 'internal_db':
        return Database;
      case 'webhook':
        return Webhook;
      default:
        return ExternalLink;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Output Destination</DialogTitle>
          <DialogDescription>
            Choose where to send this node's output when the workflow executes.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-2 mt-4">
          {destinations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              All available destinations are already configured.
            </p>
          ) : (
            destinations.map((dest) => {
              const Icon = getIcon(dest.destination_type);
              
              return (
                <Button
                  key={dest.id}
                  variant="outline"
                  className="w-full justify-start gap-3 h-auto py-3"
                  onClick={() => onSelect(dest.id)}
                >
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${dest.color}20` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: dest.color }} />
                  </div>
                  <div className="text-left">
                    <div className="font-medium">{dest.name}</div>
                    {dest.description && (
                      <div className="text-xs text-muted-foreground">
                        {dest.description}
                      </div>
                    )}
                  </div>
                </Button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
