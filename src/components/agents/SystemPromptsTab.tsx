import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SystemPrompt, PromptTag } from '@/types/prompt';
import { PromptCard } from './PromptCard';
import { PromptDialog } from './PromptDialog';

export function SystemPromptsTab() {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [tags, setTags] = useState<PromptTag[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<SystemPrompt | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPrompts();
    fetchTags();
  }, []);

  const fetchPrompts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('system_prompts')
      .select(`
        *,
        system_prompt_tags(
          tag_id,
          prompt_tags(id, name)
        )
      `)
      .order('name');

    if (error) {
      toast.error('Failed to load prompts');
      console.error(error);
    } else {
      // Transform the nested data structure
      const transformedPrompts: SystemPrompt[] = (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        prompt: p.prompt,
        created_at: p.created_at,
        updated_at: p.updated_at,
        tags: p.system_prompt_tags
          ?.map((spt: any) => spt.prompt_tags)
          .filter(Boolean) || []
      }));
      setPrompts(transformedPrompts);
    }
    setLoading(false);
  };

  const fetchTags = async () => {
    const { data, error } = await supabase
      .from('prompt_tags')
      .select('*')
      .order('name');

    if (error) {
      console.error(error);
    } else {
      setTags(data || []);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('system_prompts')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error('Failed to delete prompt');
      console.error(error);
    } else {
      toast.success('Prompt deleted');
      fetchPrompts();
    }
  };

  const handleEdit = (prompt: SystemPrompt) => {
    setEditingPrompt(prompt);
    setShowDialog(true);
  };

  const handleCloseDialog = (open: boolean) => {
    setShowDialog(open);
    if (!open) {
      setEditingPrompt(null);
    }
  };

  const handleSave = () => {
    fetchPrompts();
    fetchTags();
  };

  const filteredPrompts = filterTag
    ? prompts.filter(p => p.tags?.some(t => t.id === filterTag))
    : prompts;

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Prompt
        </Button>
      </div>

      {/* Tag filter */}
      {tags.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant={filterTag === null ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => setFilterTag(null)}
          >
            All
          </Badge>
          {tags.map(tag => (
            <Badge
              key={tag.id}
              variant={filterTag === tag.id ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setFilterTag(tag.id)}
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      {/* Prompts grid */}
      {loading ? (
        <div className="text-muted-foreground text-center py-8">Loading...</div>
      ) : filteredPrompts.length === 0 ? (
        <div className="text-muted-foreground text-center py-8">
          {prompts.length === 0
            ? 'No prompts yet. Click "Add Prompt" to create one.'
            : 'No prompts match the selected filter.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPrompts.map(prompt => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              onEdit={() => handleEdit(prompt)}
              onDelete={() => handleDelete(prompt.id)}
            />
          ))}
        </div>
      )}

      <PromptDialog
        open={showDialog}
        onOpenChange={handleCloseDialog}
        prompt={editingPrompt}
        allTags={tags}
        onSave={handleSave}
      />
    </div>
  );
}
