import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { HardDrive, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CreateSharedCacheDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (cache: { id: string; name: string }) => void;
}

export function CreateSharedCacheDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateSharedCacheDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      toast.error('Please enter a name for the shared cache');
      return;
    }

    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from('shared_caches')
        .insert({
          name: name.trim(),
          description: description.trim() || null,
          schema: {},
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Shared cache created successfully');
      onCreated({ id: data.id, name: data.name });
      setName('');
      setDescription('');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Failed to create shared cache:', error);
      toast.error(error.message || 'Failed to create shared cache');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-violet-500" />
            Create Shared Cache
          </DialogTitle>
          <DialogDescription>
            Create a new shared cache that can store data from generative nodes 
            and be referenced by other nodes in your workflows.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="cache-name">Name *</Label>
            <Input
              id="cache-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Company Research Cache"
              autoFocus
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="cache-description">Description</Label>
            <Textarea
              id="cache-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of what this cache stores..."
              rows={3}
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreate} 
            disabled={isCreating || !name.trim()}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Cache
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
