import { Edit2, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { SystemPrompt } from '@/types/prompt';

interface PromptCardProps {
  prompt: SystemPrompt;
  onEdit: () => void;
  onDelete: () => void;
}

export function PromptCard({ prompt, onEdit, onDelete }: PromptCardProps) {
  // Truncate prompt content for preview
  const previewContent = prompt.prompt.length > 150
    ? prompt.prompt.substring(0, 150) + '...'
    : prompt.prompt;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-start justify-between gap-2">
          <span className="truncate">{prompt.name}</span>
          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onEdit}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete prompt?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete "{prompt.name}". This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between gap-3">
        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
          {previewContent}
        </p>
        {prompt.tags && prompt.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {prompt.tags.map(tag => (
              <Badge key={tag.id} variant="secondary" className="text-xs">
                {tag.name}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
