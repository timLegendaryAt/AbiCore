import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { HardDrive, MoreHorizontal, Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { CreateSharedCacheDialog } from '@/components/workflow/CreateSharedCacheDialog';
import { format } from 'date-fns';

interface SharedCache {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export function SharedCachesTab() {
  const [caches, setCaches] = useState<SharedCache[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCache, setEditingCache] = useState<SharedCache | null>(null);
  const [deleteCache, setDeleteCache] = useState<SharedCache | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchCaches = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('shared_caches')
        .select('id, name, description, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCaches(data || []);
    } catch (error: any) {
      console.error('Failed to fetch shared caches:', error);
      toast.error('Failed to load shared caches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaches();
  }, []);

  const handleEditOpen = (cache: SharedCache) => {
    setEditingCache(cache);
    setEditName(cache.name);
    setEditDescription(cache.description || '');
  };

  const handleEditSave = async () => {
    if (!editingCache || !editName.trim()) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('shared_caches')
        .update({
          name: editName.trim(),
          description: editDescription.trim() || null,
        })
        .eq('id', editingCache.id);

      if (error) throw error;

      toast.success('Shared cache updated');
      setEditingCache(null);
      fetchCaches();
    } catch (error: any) {
      console.error('Failed to update shared cache:', error);
      toast.error(error.message || 'Failed to update shared cache');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCache) return;

    setDeleting(true);
    try {
      const { error } = await supabase
        .from('shared_caches')
        .delete()
        .eq('id', deleteCache.id);

      if (error) throw error;

      toast.success('Shared cache deleted');
      setDeleteCache(null);
      fetchCaches();
    } catch (error: any) {
      console.error('Failed to delete shared cache:', error);
      toast.error(error.message || 'Failed to delete shared cache');
    } finally {
      setDeleting(false);
    }
  };

  const handleCacheCreated = () => {
    fetchCaches();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-violet-500" />
          <h3 className="text-lg font-medium">Shared Caches</h3>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Add Shared Cache
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Shared caches are data stores that generative nodes can write to and dataset nodes can read from.
        Manage your shared caches here.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : caches.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <HardDrive className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No shared caches yet</p>
          <p className="text-sm">Create one to get started</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {caches.map((cache) => (
                <TableRow key={cache.id}>
                  <TableCell className="font-medium">{cache.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {cache.description || '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(cache.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEditOpen(cache)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteCache(cache)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Dialog */}
      <CreateSharedCacheDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={handleCacheCreated}
      />

      {/* Edit Dialog */}
      <Dialog open={!!editingCache} onOpenChange={() => setEditingCache(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardDrive className="w-5 h-5 text-violet-500" />
              Edit Shared Cache
            </DialogTitle>
            <DialogDescription>
              Update the name and description for this shared cache.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Cache name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Optional description..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCache(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleEditSave}
              disabled={saving || !editName.trim()}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteCache} onOpenChange={() => setDeleteCache(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shared Cache</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteCache?.name}"? This action cannot be undone
              and may affect workflows that reference this cache.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
