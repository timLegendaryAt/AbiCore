import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Edit, Trash2, Wrench } from 'lucide-react';
import { AITool } from '@/types/ai-agent';
import { useState } from 'react';
import { AIToolDialog } from './AIToolDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

interface AIToolCardProps {
  tool: AITool;
  onUpdate: () => void;
}

export function AIToolCard({ tool, onUpdate }: AIToolCardProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggleEnabled = async (enabled: boolean) => {
    setIsUpdating(true);
    const { error } = await supabase
      .from('ai_tools')
      .update({ enabled })
      .eq('id', tool.id);

    if (error) {
      toast.error('Failed to update tool status');
      console.error(error);
    } else {
      toast.success(`Tool ${enabled ? 'enabled' : 'disabled'}`);
      onUpdate();
    }
    setIsUpdating(false);
  };

  const handleDelete = async () => {
    const { error } = await supabase
      .from('ai_tools')
      .delete()
      .eq('id', tool.id);

    if (error) {
      toast.error('Failed to delete tool');
      console.error(error);
    } else {
      toast.success('Tool deleted successfully');
      onUpdate();
    }
    setShowDeleteDialog(false);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">{tool.name}</CardTitle>
                <CardDescription className="text-xs">{tool.description}</CardDescription>
              </div>
            </div>
            <Switch
              checked={tool.enabled}
              onCheckedChange={handleToggleEnabled}
              disabled={isUpdating}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Parameters Schema</div>
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-24">
              {JSON.stringify(tool.parameters, null, 2)}
            </pre>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => setShowDialog(true)} className="flex-1" variant="outline" size="sm">
              <Edit className="h-3 w-3 mr-1" />
              Edit
            </Button>
            <Button
              onClick={() => setShowDeleteDialog(true)}
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <AIToolDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        tool={tool}
        onSave={onUpdate}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tool</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{tool.name}"? This action cannot be undone and will
              remove the tool from all agents using it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
