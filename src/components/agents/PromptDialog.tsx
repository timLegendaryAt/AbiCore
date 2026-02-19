import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SystemPrompt, PromptTag } from '@/types/prompt';

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt: SystemPrompt | null;
  allTags: PromptTag[];
  onSave: () => void;
}

export function PromptDialog({
  open,
  onOpenChange,
  prompt,
  allTags,
  onSave,
}: PromptDialogProps) {
  const [name, setName] = useState('');
  const [promptText, setPromptText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState('');
  const [saving, setSaving] = useState(false);
  const [localTags, setLocalTags] = useState<PromptTag[]>([]);

  // Sync local tags with prop
  useEffect(() => {
    setLocalTags(allTags);
  }, [allTags]);

  // Populate form when editing
  useEffect(() => {
    if (prompt) {
      setName(prompt.name);
      setPromptText(prompt.prompt);
      setSelectedTags(prompt.tags?.map(t => t.id) || []);
    } else {
      setName('');
      setPromptText('');
      setSelectedTags([]);
    }
    setNewTagName('');
  }, [prompt, open]);

  const toggleTag = (tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
  };

  const handleAddTag = async () => {
    const trimmedName = newTagName.trim();
    if (!trimmedName) return;

    // Check if tag already exists
    const existingTag = localTags.find(
      t => t.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existingTag) {
      if (!selectedTags.includes(existingTag.id)) {
        setSelectedTags(prev => [...prev, existingTag.id]);
      }
      setNewTagName('');
      return;
    }

    // Create new tag
    const { data, error } = await supabase
      .from('prompt_tags')
      .insert({ name: trimmedName })
      .select()
      .single();

    if (error) {
      toast.error('Failed to create tag');
      console.error(error);
    } else if (data) {
      setLocalTags(prev => [...prev, data]);
      setSelectedTags(prev => [...prev, data.id]);
      setNewTagName('');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a prompt name');
      return;
    }
    if (!promptText.trim()) {
      toast.error('Please enter prompt content');
      return;
    }

    setSaving(true);

    try {
      let promptId: string;

      if (prompt) {
        // Update existing prompt
        const { error } = await supabase
          .from('system_prompts')
          .update({ name: name.trim(), prompt: promptText.trim() })
          .eq('id', prompt.id);

        if (error) throw error;
        promptId = prompt.id;

        // Remove old tag associations
        await supabase
          .from('system_prompt_tags')
          .delete()
          .eq('prompt_id', promptId);
      } else {
        // Create new prompt
        const { data, error } = await supabase
          .from('system_prompts')
          .insert({ name: name.trim(), prompt: promptText.trim() })
          .select()
          .single();

        if (error) throw error;
        promptId = data.id;
      }

      // Insert tag associations
      if (selectedTags.length > 0) {
        const tagAssociations = selectedTags.map(tagId => ({
          prompt_id: promptId,
          tag_id: tagId,
        }));

        const { error: tagError } = await supabase
          .from('system_prompt_tags')
          .insert(tagAssociations);

        if (tagError) throw tagError;
      }

      toast.success(prompt ? 'Prompt updated' : 'Prompt created');
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save prompt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{prompt ? 'Edit Prompt' : 'Add Prompt'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name field */}
          <div className="space-y-2">
            <Label htmlFor="name">Prompt Name</Label>
            <Input
              id="name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Market Analysis"
            />
          </div>

          {/* Prompt content */}
          <div className="space-y-2">
            <Label htmlFor="prompt">Prompt</Label>
            <Textarea
              id="prompt"
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
              className="min-h-[200px] font-mono text-sm"
              placeholder="Enter your system prompt here..."
            />
          </div>

          {/* Tags section */}
          <div className="space-y-2">
            <Label>Tags</Label>
            {localTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {localTags.map(tag => (
                  <Badge
                    key={tag.id}
                    variant={selectedTags.includes(tag.id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleTag(tag.id)}
                  >
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}

            {/* Add new tag inline */}
            <div className="flex gap-2 mt-3">
              <Input
                placeholder="New tag name..."
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddTag}
                disabled={!newTagName.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Tag
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
