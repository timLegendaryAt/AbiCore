import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, FileText, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SystemPrompt, PromptTag } from "@/types/prompt";

interface SystemPromptWithTags extends SystemPrompt {
  tags?: PromptTag[];
}

interface SystemPromptSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (prompt: { id: string; name: string; prompt: string }) => void;
}

export function SystemPromptSelector({ open, onOpenChange, onSelect }: SystemPromptSelectorProps) {
  const [prompts, setPrompts] = useState<SystemPromptWithTags[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set(["Uncategorized"]));

  useEffect(() => {
    if (open) {
      fetchPrompts();
    }
  }, [open]);

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      // Fetch prompts with their tags
      const { data: promptsData, error: promptsError } = await supabase
        .from('system_prompts')
        .select('id, name, prompt, created_at, updated_at')
        .order('name');

      if (promptsError) throw promptsError;

      // Fetch tags
      const { data: tagsData } = await supabase
        .from('prompt_tags')
        .select('id, name');

      // Fetch prompt-tag associations
      const { data: associations } = await supabase
        .from('system_prompt_tags')
        .select('prompt_id, tag_id');

      // Build a map of prompt_id -> tags
      const tagMap = new Map<string, PromptTag[]>();
      if (associations && tagsData) {
        for (const assoc of associations) {
          const tag = tagsData.find(t => t.id === assoc.tag_id);
          if (tag) {
            const existing = tagMap.get(assoc.prompt_id) || [];
            existing.push(tag);
            tagMap.set(assoc.prompt_id, existing);
          }
        }
      }

      // Merge tags into prompts
      const promptsWithTags: SystemPromptWithTags[] = (promptsData || []).map(p => ({
        ...p,
        tags: tagMap.get(p.id) || []
      }));

      setPrompts(promptsWithTags);
    } catch (error) {
      console.error('Error fetching system prompts:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter and group prompts by tag
  const { groupedPrompts, allTags } = useMemo(() => {
    const filtered = prompts.filter(p => 
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.prompt.toLowerCase().includes(search.toLowerCase())
    );

    // Group by first tag (or "Uncategorized")
    const groups = new Map<string, SystemPromptWithTags[]>();
    const tagSet = new Set<string>();

    for (const prompt of filtered) {
      const tagName = prompt.tags && prompt.tags.length > 0 
        ? prompt.tags[0].name 
        : "Uncategorized";
      
      tagSet.add(tagName);
      const existing = groups.get(tagName) || [];
      existing.push(prompt);
      groups.set(tagName, existing);
    }

    // Sort tags alphabetically, but put "Uncategorized" last
    const sortedTags = Array.from(tagSet).sort((a, b) => {
      if (a === "Uncategorized") return 1;
      if (b === "Uncategorized") return -1;
      return a.localeCompare(b);
    });

    return { groupedPrompts: groups, allTags: sortedTags };
  }, [prompts, search]);

  const toggleTag = (tag: string) => {
    setExpandedTags(prev => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  };

  const handleSelect = (prompt: SystemPromptWithTags) => {
    onSelect({
      id: prompt.id,
      name: prompt.name,
      prompt: prompt.prompt
    });
    onOpenChange(false);
    setSearch("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select System Prompt</DialogTitle>
          <DialogDescription>
            Choose a system prompt from your library to use in this prompt component
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search prompts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="flex-1 min-h-0 max-h-[400px] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : allTags.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No system prompts found</p>
              <p className="text-sm">Create prompts in Admin → Agents & Models → System Prompts</p>
            </div>
          ) : (
            <div className="space-y-2">
              {allTags.map(tag => {
                const tagPrompts = groupedPrompts.get(tag) || [];
                const isExpanded = expandedTags.has(tag);

                return (
                  <Collapsible key={tag} open={isExpanded} onOpenChange={() => toggleTag(tag)}>
                    <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-muted/50 transition-colors">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium text-sm">{tag}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {tagPrompts.length}
                      </Badge>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="ml-6 space-y-1 mt-1">
                        {tagPrompts.map(prompt => (
                          <Button
                            key={prompt.id}
                            variant="ghost"
                            className="w-full justify-start h-auto py-2 px-3"
                            onClick={() => handleSelect(prompt)}
                          >
                            <div className="flex-1 text-left min-w-0">
                              <div className="font-medium text-sm truncate">
                                {prompt.name}
                              </div>
                              <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                {prompt.prompt.substring(0, 150)}
                                {prompt.prompt.length > 150 ? '...' : ''}
                              </div>
                            </div>
                          </Button>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
