import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GripVertical, X, Plus, FileText, Link, Plug, BookOpen, Braces, ArrowRight, Copy, Loader2, Sparkles, Hash, Minus, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { PromptPart, PromptPartType } from "@/types/workflow";
import { Integration } from "@/types/integration";
import { Framework } from "@/types/framework";

interface PromptSnippet {
  id: string;
  title: string;
  content: string;
}
import { DependencySelector } from "@/components/workflow/DependencySelector";
import { SystemPromptSelector } from "@/components/workflow/SystemPromptSelector";
import { FrameworkSelector } from "@/components/workflow/FrameworkSelector";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState, useEffect, useRef } from "react";

interface PromptBuilderProps {
  promptParts: PromptPart[];
  availableNodes: Array<{ id: string; label: string }>;
  integrations: Integration[];
  onChange: (parts: PromptPart[]) => void;
}

interface SortableItemProps {
  part: PromptPart;
  nodeLabel?: string;
  integrationLabel?: string;
  frameworkLabel?: string;
  frameworkCategory?: string;
  onDelete: () => void;
  onUpdate: (value: string) => void;
  onEditClick?: () => void;
  onToggleTrigger?: (checked: boolean) => void;
  onDuplicate: () => void;
}

function SortableItem({ part, nodeLabel, integrationLabel, frameworkLabel, frameworkCategory, onDelete, onUpdate, onEditClick, onToggleTrigger, onDuplicate }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: part.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2 p-3 py-4 bg-secondary/50 rounded-lg border border-border"
    >
      <div className="flex flex-col items-center gap-1.5 mt-1">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <button
          type="button"
          onClick={onDuplicate}
          className="p-0.5 rounded hover:bg-muted transition-colors"
          title="Duplicate"
        >
          <Copy className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
      
      <div className="flex-1 min-w-0">
        {part.type === 'dependency' ? (
          <div className="flex flex-col gap-1 w-full">
            <span className="text-sm font-medium truncate text-foreground">
              {nodeLabel || part.value}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-primary px-2 py-0.5 bg-primary/10 rounded shrink-0">
                NODE
              </span>
              {part.workflowName && (
                <span className="text-xs text-muted-foreground shrink-0">
                  ({part.workflowName})
                </span>
              )}
              <div className="flex items-center gap-1 ml-auto shrink-0">
                <Checkbox
                  id={`trigger-${part.id}`}
                  checked={part.triggersExecution ?? true}
                  onCheckedChange={(checked) => onToggleTrigger?.(checked === true)}
                  className="h-3 w-3"
                />
                <label 
                  htmlFor={`trigger-${part.id}`}
                  className="text-xs text-muted-foreground cursor-pointer"
                >
                  Trigger
                </label>
              </div>
            </div>
          </div>
        ) : part.type === 'integration' ? (
          <div className="flex flex-col gap-1 w-full">
            <span className="text-sm font-medium truncate text-foreground">
              {integrationLabel || part.value}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: 'hsl(var(--chart-5) / 0.1)', color: 'hsl(var(--chart-5))' }}>
                INTEGRATION
              </span>
            </div>
          </div>
        ) : part.type === 'framework' ? (
          <div className="flex flex-col gap-1 w-full">
            <span className="text-sm font-medium truncate text-foreground">
              {frameworkLabel || part.frameworkName || part.value}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400">
                {frameworkCategory === 'lifecycle' ? 'LIFECYCLE' : 'FRAMEWORK'}
              </span>
            </div>
          </div>
        ) : part.systemPromptId ? (
          <div className="flex flex-col gap-1 w-full">
            <span className="text-sm font-medium truncate text-foreground">
              {part.systemPromptName || 'System Prompt'}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400">
                SYSTEM PROMPT
              </span>
            </div>
            <div 
              onClick={onEditClick}
              className="mt-1 text-xs text-muted-foreground line-clamp-2 cursor-pointer hover:text-foreground transition-colors"
            >
              {part.value ? part.value.substring(0, 100) + (part.value.length > 100 ? '...' : '') : 'Click to view...'}
            </div>
          </div>
        ) : (
          <div
            onClick={onEditClick}
            className="min-h-[32px] p-2 bg-background border border-border rounded-md cursor-pointer hover:bg-muted/50 transition-colors w-full"
          >
            {part.value ? (
              <p className="text-sm line-clamp-2 text-foreground">
                {part.value}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Click to add prompt text...
              </p>
            )}
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={onDelete}
        className="shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function PromptBuilder({ promptParts, availableNodes, integrations, onChange }: PromptBuilderProps) {
  const [showDependencySelector, setShowDependencySelector] = useState(false);
  const [showIntegrationSelector, setShowIntegrationSelector] = useState(false);
  const [showFrameworkSelector, setShowFrameworkSelector] = useState(false);
  const [showSystemPromptSelector, setShowSystemPromptSelector] = useState(false);
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [editingPart, setEditingPart] = useState<PromptPart | null>(null);
  const [editingValue, setEditingValue] = useState("");
  
  // System prompt state for edit dialog
  const [selectedSystemPrompt, setSelectedSystemPrompt] = useState<{
    id: string;
    name: string;
    prompt: string;
  } | null>(null);
  
  // Sidebar tab state
  const [activeTab, setActiveTab] = useState<string>("json");
  
  // JSON converter state
  const [jsonInput, setJsonInput] = useState("");
  const [jsonOutput, setJsonOutput] = useState("");
  
  // AI Improve state
  const [improvedPrompt, setImprovedPrompt] = useState("");
  const [isImproving, setIsImproving] = useState(false);
  const [hasTriggeredImprove, setHasTriggeredImprove] = useState(false);
  
  // Snippet state
  const [snippets, setSnippets] = useState<PromptSnippet[]>([]);
  const [showAddSnippetDialog, setShowAddSnippetDialog] = useState(false);
  const [newSnippetTitle, setNewSnippetTitle] = useState("");
  const [selectedText, setSelectedText] = useState("");
  
  // Textarea ref for cursor position
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const convertToJson = () => {
    try {
      const jsonString = JSON.stringify(jsonInput);
      setJsonOutput(jsonString);
    } catch (e) {
      setJsonOutput("Error converting to JSON");
    }
  };

  const copyJsonToClipboard = async () => {
    if (!jsonOutput) return;
    await navigator.clipboard.writeText(jsonOutput);
    toast.success("Copied to clipboard");
  };

  const copyImprovedToClipboard = async () => {
    if (!improvedPrompt) return;
    await navigator.clipboard.writeText(improvedPrompt);
    toast.success("Copied to clipboard");
  };

  const insertAtCursor = (text: string) => {
    if (!textareaRef.current) {
      setEditingValue(prev => prev + text);
      return;
    }
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = editingValue.substring(0, start);
    const after = editingValue.substring(end);
    
    const newValue = before + text + after;
    setEditingValue(newValue);
    
    // Set cursor position after inserted text
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + text.length;
      textarea.focus();
    }, 0);
  };

  const improvePrompt = async () => {
    if (selectedSystemPrompt) {
      toast.error("Cannot improve a linked system prompt — edit it in the System Prompts library instead.");
      return;
    }

    if (!editingValue.trim()) {
      toast.error("Please enter some prompt text first");
      return;
    }
    
    setIsImproving(true);
    setImprovedPrompt("");
    
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-improve-prompt`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ userPrompt: editingValue }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${resp.status}`);
      }

      if (!resp.body) throw new Error('No response body');

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              accumulated += content;
              setImprovedPrompt(accumulated);
            }
          } catch { /* partial JSON, wait for more */ }
        }
      }

      if (!accumulated) {
        throw new Error('No improved prompt returned');
      }
    } catch (error) {
      console.error('Error improving prompt:', error);
      toast.error("Failed to improve prompt");
    } finally {
      setIsImproving(false);
    }
  };

  const useImprovedPrompt = () => {
    setEditingValue(improvedPrompt);
    setActiveTab('json');
    toast.success("Prompt replaced with improved version");
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    
    // Auto-trigger improve when switching to improve tab
    if (tab === 'improve' && editingValue.trim() && !hasTriggeredImprove && !isImproving && !improvedPrompt) {
      setHasTriggeredImprove(true);
      improvePrompt();
    }
  };

  // Reset improve state when dialog closes or editing value changes significantly
  useEffect(() => {
    if (!editingPart) {
      setImprovedPrompt("");
      setHasTriggeredImprove(false);
      setActiveTab("json");
      setSelectedSystemPrompt(null);
    }
  }, [editingPart]);

  // Fetch frameworks on mount
  useEffect(() => {
    const fetchFrameworks = async () => {
      const { data } = await supabase
        .from('frameworks')
        .select('id, name, type, category, schema')
        .order('name');
      if (data) {
        setFrameworks(data as Framework[]);
      }
    };
    fetchFrameworks();
  }, []);

  // Fetch snippets on mount
  useEffect(() => {
    const fetchSnippets = async () => {
      const { data } = await supabase
        .from('prompt_snippets')
        .select('id, title, content')
        .order('title');
      if (data) {
        setSnippets(data);
      }
    };
    fetchSnippets();
  }, []);

  // Auto-refresh cached system prompt previews
  const lastFetchedIdsRef = useRef<string>("");
  useEffect(() => {
    const systemPromptIds = promptParts
      .filter(p => p.systemPromptId)
      .map(p => p.systemPromptId!)
      .filter((id, i, arr) => arr.indexOf(id) === i);

    if (systemPromptIds.length === 0) return;

    const idsKey = systemPromptIds.sort().join(",");
    if (idsKey === lastFetchedIdsRef.current) return;
    lastFetchedIdsRef.current = idsKey;

    const refreshCachedPrompts = async () => {
      const { data, error } = await supabase
        .from('system_prompts')
        .select('id, prompt, name')
        .in('id', systemPromptIds);

      if (error || !data) return;

      const promptMap = new Map(data.map(d => [d.id, { prompt: d.prompt, name: d.name }]));
      let hasChanges = false;

      const updatedParts = promptParts.map(part => {
        if (!part.systemPromptId) return part;
        const fresh = promptMap.get(part.systemPromptId);
        if (!fresh) return part;
        if (part.value !== fresh.prompt || part.systemPromptName !== fresh.name) {
          hasChanges = true;
          return { ...part, value: fresh.prompt, systemPromptName: fresh.name };
        }
        return part;
      });

      if (hasChanges) {
        onChange(updatedParts);
      }
    };

    refreshCachedPrompts();
  }, [promptParts, onChange]);

  const handleAddSelection = () => {
    if (!textareaRef.current) {
      toast.error("Please select some text first");
      return;
    }
    
    const selection = textareaRef.current.value.substring(
      textareaRef.current.selectionStart,
      textareaRef.current.selectionEnd
    );
    
    if (selection?.trim()) {
      setSelectedText(selection);
      setShowAddSnippetDialog(true);
    } else {
      toast.error("Please select some text first");
    }
  };

  const handleSaveSnippet = async () => {
    if (!newSnippetTitle.trim()) {
      toast.error("Please enter a title");
      return;
    }
    
    const { data, error } = await supabase
      .from('prompt_snippets')
      .insert({ title: newSnippetTitle, content: selectedText })
      .select()
      .single();
    
    if (error) {
      toast.error("Failed to save snippet");
      return;
    }
    
    setSnippets(prev => [...prev, data as PromptSnippet]);
    setShowAddSnippetDialog(false);
    setNewSnippetTitle("");
    setSelectedText("");
    toast.success("Snippet saved");
  };

  const handleDeleteSnippet = async (id: string) => {
    await supabase.from('prompt_snippets').delete().eq('id', id);
    setSnippets(prev => prev.filter(s => s.id !== id));
    toast.success("Snippet deleted");
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = promptParts.findIndex((p) => p.id === active.id);
      const newIndex = promptParts.findIndex((p) => p.id === over.id);

      const reordered = arrayMove(promptParts, oldIndex, newIndex).map(
        (part, index) => ({ ...part, order: index })
      );
      onChange(reordered);
    }
  };

  const addDependency = (nodeId: string, nodeLabel: string, nodeType: string, workflowId: string, workflowName: string) => {
    const newPart: PromptPart = {
      id: crypto.randomUUID(),
      type: "dependency",
      value: nodeId,
      order: promptParts.length,
      workflowId: workflowId,
      workflowName: workflowName,
      nodeLabel: nodeLabel,
    };
    onChange([...promptParts, newPart]);
  };

  const addPrompt = () => {
    const newPart: PromptPart = {
      id: crypto.randomUUID(),
      type: "prompt",
      value: "",
      order: promptParts.length,
    };
    onChange([...promptParts, newPart]);
  };

  const addIntegration = (integrationId: string) => {
    const newPart: PromptPart = {
      id: crypto.randomUUID(),
      type: "integration",
      value: integrationId,
      order: promptParts.length,
    };
    onChange([...promptParts, newPart]);
    setShowIntegrationSelector(false);
  };

  const addFramework = (frameworkId: string, frameworkName: string) => {
    const newPart: PromptPart = {
      id: crypto.randomUUID(),
      type: "framework",
      value: frameworkId,
      order: promptParts.length,
      frameworkName: frameworkName,
    };
    onChange([...promptParts, newPart]);
    setShowFrameworkSelector(false);
  };

  const deletePart = (id: string) => {
    const updated = promptParts
      .filter((p) => p.id !== id)
      .map((part, index) => ({ ...part, order: index }));
    onChange(updated);
  };

  const duplicatePart = (id: string) => {
    const partToDuplicate = promptParts.find((p) => p.id === id);
    if (!partToDuplicate) return;
    
    const newPart: PromptPart = {
      ...partToDuplicate,
      id: crypto.randomUUID(),
      order: promptParts.length,
    };
    onChange([...promptParts, newPart]);
  };

  const updatePart = (id: string, value: string) => {
    const updated = promptParts.map((p) =>
      p.id === id ? { ...p, value } : p
    );
    onChange(updated);
  };

  const toggleTrigger = (partId: string, checked: boolean) => {
    const updated = promptParts.map((p) =>
      p.id === partId ? { ...p, triggersExecution: checked } : p
    );
    onChange(updated);
  };

  const getNodeLabel = (nodeId: string) => {
    return availableNodes.find((n) => n.id === nodeId)?.label;
  };

  const getIntegrationLabel = (integrationId: string) => {
    return integrations.find((i) => i.id === integrationId)?.name;
  };

  const getFrameworkInfo = (frameworkId: string) => {
    return frameworks.find((f) => f.id === frameworkId);
  };

  const handleEditPrompt = (part: PromptPart) => {
    setEditingPart(part);
    setEditingValue(part.value);
    // Load existing system prompt if any
    if (part.systemPromptId && part.systemPromptName) {
      setSelectedSystemPrompt({
        id: part.systemPromptId,
        name: part.systemPromptName,
        prompt: part.value // The value stores the cached prompt content
      });
    } else {
      setSelectedSystemPrompt(null);
    }
  };

  const handleSavePrompt = () => {
    if (editingPart) {
      // Update the part with system prompt info if selected
      const updated = promptParts.map((p) => {
        if (p.id === editingPart.id) {
          if (selectedSystemPrompt) {
            return {
              ...p,
              value: selectedSystemPrompt.prompt, // Cache the prompt content
              systemPromptId: selectedSystemPrompt.id,
              systemPromptName: selectedSystemPrompt.name,
            };
          } else {
            // Clear system prompt fields if not using one
            const { systemPromptId, systemPromptName, ...rest } = p;
            return { ...rest, value: editingValue };
          }
        }
        return p;
      });
      onChange(updated);
      setEditingPart(null);
      setEditingValue("");
      setSelectedSystemPrompt(null);
    }
  };

  const handleClearSystemPrompt = () => {
    setSelectedSystemPrompt(null);
  };

  const handleSelectSystemPrompt = (prompt: { id: string; name: string; prompt: string }) => {
    setSelectedSystemPrompt(prompt);
    setEditingValue(prompt.prompt); // Set value so preview works
  };

  const sortedParts = [...promptParts].sort((a, b) => a.order - b.order);

  // Built-in quick insert elements (keeping only dividers)
  const builtInElements = [
    { label: "###", description: "Section header", icon: Hash },
    { label: "---", description: "Divider", icon: Minus },
  ];

  return (
    <div className="space-y-4">
      <div className="pb-4">
        <Label>Prompt Builder</Label>
      </div>

      <div className="space-y-4">
        {sortedParts.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sortedParts.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {sortedParts.map((part) => {
                  const frameworkInfo = part.type === 'framework' ? getFrameworkInfo(part.value) : undefined;
                  return (
                    <SortableItem
                      key={part.id}
                      part={part}
                      nodeLabel={part.type === 'dependency' ? (part.nodeLabel || getNodeLabel(part.value)) : undefined}
                      integrationLabel={part.type === 'integration' ? getIntegrationLabel(part.value) : undefined}
                      frameworkLabel={frameworkInfo?.name}
                      frameworkCategory={frameworkInfo?.category || undefined}
                      onDelete={() => deletePart(part.id)}
                      onUpdate={(value) => updatePart(part.id, value)}
                      onEditClick={part.type === 'prompt' ? () => handleEditPrompt(part) : undefined}
                      onToggleTrigger={part.type === 'dependency' ? (checked) => toggleTrigger(part.id, checked) : undefined}
                      onDuplicate={() => duplicatePart(part.id)}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add Component
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[200px]">
            <DropdownMenuItem onClick={addPrompt}>
              <FileText className="h-4 w-4 mr-2" />
              Prompt
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowDependencySelector(true)}>
              <Link className="h-4 w-4 mr-2" />
              Dependency
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowIntegrationSelector(true)}>
              <Plug className="h-4 w-4 mr-2" />
              Integration
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowFrameworkSelector(true)}>
              <BookOpen className="h-4 w-4 mr-2" />
              Framework / Lifecycle
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {sortedParts.length > 0 && (
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg border border-border">
            <Label className="text-xs">Preview</Label>
            <div className="text-sm space-y-1 font-mono text-muted-foreground">
              {sortedParts.map((part) => (
                <div key={part.id}>
                  {part.type === 'dependency' ? (
                    <span className="text-primary">
                      [{part.workflowName ? `${part.workflowName}::` : ''}
                      {part.nodeLabel || getNodeLabel(part.value) || 'Unknown Node'}]
                    </span>
                  ) : part.type === 'integration' ? (
                    <span style={{ color: 'hsl(var(--chart-5))' }}>
                      [[{getIntegrationLabel(part.value) || 'Unknown Integration'}]]
                    </span>
                  ) : part.type === 'framework' ? (
                    <span className="text-purple-500">
                      [Framework: {getFrameworkInfo(part.value)?.name || part.frameworkName || 'Unknown'}]
                    </span>
                  ) : (
                    <span>{part.value || '(empty prompt)'}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DependencySelector
        open={showDependencySelector}
        onOpenChange={setShowDependencySelector}
        currentWorkflowId="current"
        currentNodeId={undefined}
        onSelect={addDependency}
        selectedIds={promptParts.filter(p => p.type === 'dependency').map(p => p.value)}
      />

      <Dialog open={showIntegrationSelector} onOpenChange={setShowIntegrationSelector}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Integration</DialogTitle>
            <DialogDescription>
              Choose an integration to add as a data source
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {integrations.filter(i => i.connected).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No connected integrations available</p>
              </div>
            ) : (
              integrations
                .filter(i => i.connected)
                .map(integration => (
                  <Button
                    key={integration.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => addIntegration(integration.id)}
                  >
                    <div 
                      className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold mr-3"
                      style={{ backgroundColor: integration.color }}
                    >
                      {integration.initials}
                    </div>
                    <div className="text-left">
                      <div className="font-medium">{integration.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {integration.description}
                      </div>
                    </div>
                  </Button>
                ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      <FrameworkSelector
        open={showFrameworkSelector}
        onOpenChange={setShowFrameworkSelector}
        onSelect={addFramework}
        selectedIds={promptParts.filter(p => p.type === 'framework').map(p => p.value)}
      />

      {/* Edit Prompt Dialog with Tabbed Sidebar */}
      <Dialog open={!!editingPart} onOpenChange={(open) => {
        if (!open) {
          setEditingPart(null);
          setJsonInput("");
          setJsonOutput("");
          setImprovedPrompt("");
          setHasTriggeredImprove(false);
          setActiveTab("json");
          setSelectedSystemPrompt(null);
        }
      }}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-xl">Prompt Builder</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 min-h-0 py-4 flex gap-4">
            {/* Left: Main Editor */}
            <div className="flex-1 flex flex-col min-w-0">
              {selectedSystemPrompt ? (
                <div className="flex-1 flex flex-col">
                  {/* System Prompt Badge */}
                  <div className="flex items-center gap-2 mb-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <ScrollText className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-amber-800 dark:text-amber-200">
                        {selectedSystemPrompt.name}
                      </div>
                      <div className="text-xs text-amber-600 dark:text-amber-400">
                        Using prompt from library. Click × to use custom prompt.
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={handleClearSystemPrompt}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {/* Grayed out preview */}
                  <Textarea
                    value={selectedSystemPrompt.prompt}
                    readOnly
                    className="flex-1 min-h-[460px] resize-none font-mono text-sm bg-muted/50 text-muted-foreground cursor-not-allowed"
                  />
                </div>
              ) : (
                <Textarea
                  ref={textareaRef}
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  placeholder="Enter your prompt text..."
                  className="flex-1 min-h-[500px] resize-none font-mono text-sm"
                />
              )}
            </div>
            
            {/* Right: Tabbed Sidebar */}
            <div className="w-72 flex flex-col border-l pl-4 min-h-0">
              <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col h-full min-h-0">
                <TabsList className="w-full grid grid-cols-3 shrink-0">
                  <TabsTrigger value="json" className="text-xs px-2">
                    <Braces className="h-3 w-3 mr-1" />
                    JSON
                  </TabsTrigger>
                  <TabsTrigger value="add" className="text-xs px-2">
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </TabsTrigger>
                  <TabsTrigger value="improve" className="text-xs px-2">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Improve
                  </TabsTrigger>
                </TabsList>
                
                {/* JSON Converter Tab */}
                <TabsContent value="json" className="flex-1 flex flex-col gap-2 mt-3 overflow-y-auto min-h-0 data-[state=inactive]:hidden">
                  <Label className="text-xs text-muted-foreground shrink-0">Input Text</Label>
                  <Textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder="Paste text to convert..."
                    className="min-h-[100px] resize-none text-xs font-mono shrink-0"
                  />
                  
                  <Button size="sm" onClick={convertToJson} className="w-full shrink-0">
                    <ArrowRight className="h-3 w-3 mr-2" />
                    Convert to JSON
                  </Button>
                  
                  <Label className="text-xs text-muted-foreground shrink-0">JSON Output</Label>
                  <div className="relative shrink-0">
                    <Textarea
                      value={jsonOutput}
                      readOnly
                      placeholder="Converted JSON will appear here..."
                      className="min-h-[100px] resize-none text-xs font-mono bg-muted/50"
                    />
                    {jsonOutput && (
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="absolute top-2 right-2 h-6 w-6"
                        onClick={copyJsonToClipboard}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  
                  <p className="text-[10px] text-muted-foreground shrink-0">
                    Converts text to a properly escaped JSON string format
                  </p>
                </TabsContent>
                
                {/* Add Element Tab */}
                <TabsContent value="add" className="flex-1 flex flex-col gap-2 mt-3 overflow-y-auto min-h-0 data-[state=inactive]:hidden">
                  {/* Add Selection Button */}
                  <Button
                    variant="default"
                    size="sm"
                    className="w-full text-xs h-8 shrink-0"
                    onClick={handleAddSelection}
                  >
                    <Plus className="h-3 w-3 mr-2" />
                    Add Selection
                  </Button>
                  
                  <div className="border-t pt-2 mt-1 shrink-0">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Quick Insert</Label>
                    
                    {/* User Snippets */}
                    {snippets.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {snippets.map((snippet) => (
                          <div key={snippet.id} className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1 justify-start text-xs h-8 overflow-hidden"
                              onClick={() => insertAtCursor(snippet.content)}
                            >
                              <FileText className="h-3 w-3 mr-2 shrink-0" />
                              <span className="truncate">{snippet.title}</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => handleDeleteSnippet(snippet.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Built-in dividers */}
                    <div className="space-y-1">
                      {builtInElements.map((element) => (
                        <Button
                          key={element.label}
                          variant="outline"
                          size="sm"
                          className="w-full justify-start text-xs h-8"
                          onClick={() => insertAtCursor(element.label)}
                        >
                          <element.icon className="h-3 w-3 mr-2 shrink-0" />
                          <span className="font-mono">{element.label}</span>
                          <span className="ml-auto text-muted-foreground text-[10px]">
                            {element.description}
                          </span>
                        </Button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="border-t pt-2 mt-2 shrink-0">
                    <Label className="text-xs text-muted-foreground mb-1.5 block">Custom</Label>
                    <div className="flex gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-7"
                        onClick={() => insertAtCursor("\n\n")}
                      >
                        New Lines
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-7"
                        onClick={() => insertAtCursor("  ")}
                      >
                        Indent
                      </Button>
                    </div>
                  </div>
                  
                  <p className="text-[10px] text-muted-foreground shrink-0 mt-auto">
                    Select text and click "Add Selection" to save a reusable snippet
                  </p>
                </TabsContent>
                
                {/* Improve Tab */}
                <TabsContent value="improve" className="flex-1 flex flex-col gap-2 mt-3 overflow-y-auto min-h-0 data-[state=inactive]:hidden">
                  {isImproving ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      <span className="text-xs text-muted-foreground">Improving prompt...</span>
                    </div>
                  ) : improvedPrompt ? (
                    <>
                      <Label className="text-xs text-muted-foreground shrink-0">Suggested Improvement</Label>
                      <Textarea
                        value={improvedPrompt}
                        readOnly
                        className="flex-1 min-h-[200px] resize-none text-xs font-mono bg-muted/50"
                      />
                      <div className="flex gap-1.5 shrink-0">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="flex-1 h-8"
                          onClick={copyImprovedToClipboard}
                        >
                          <Copy className="h-3 w-3 mr-1.5" />
                          Copy
                        </Button>
                        <Button 
                          size="sm"
                          className="flex-1 h-8"
                          onClick={useImprovedPrompt}
                        >
                          <Sparkles className="h-3 w-3 mr-1.5" />
                          Use This
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-xs h-7 shrink-0"
                        onClick={() => {
                          setImprovedPrompt("");
                          setHasTriggeredImprove(false);
                          improvePrompt();
                        }}
                      >
                        Regenerate
                      </Button>
                    </>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
                      <Sparkles className="h-6 w-6 text-muted-foreground" />
                      {editingValue.trim() ? (
                        <>
                          <span className="text-xs text-muted-foreground">
                            Ready to improve your prompt
                          </span>
                          <Button size="sm" className="h-8" onClick={improvePrompt}>
                            <Sparkles className="h-3 w-3 mr-1.5" />
                            Improve Prompt
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Enter some prompt text first
                        </span>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          </div>
          
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowSystemPromptSelector(true)}
              className="mr-auto"
              disabled={!!selectedSystemPrompt}
            >
              <ScrollText className="h-4 w-4 mr-2" />
              Use System Prompt
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setEditingPart(null);
                setJsonInput("");
                setJsonOutput("");
                setImprovedPrompt("");
                setHasTriggeredImprove(false);
                setActiveTab("json");
                setSelectedSystemPrompt(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleSavePrompt}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* System Prompt Selector */}
      <SystemPromptSelector
        open={showSystemPromptSelector}
        onOpenChange={setShowSystemPromptSelector}
        onSelect={handleSelectSystemPrompt}
      />

      {/* Add Snippet Dialog */}
      <Dialog open={showAddSnippetDialog} onOpenChange={setShowAddSnippetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Save Snippet</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Title</Label>
              <Input
                value={newSnippetTitle}
                onChange={(e) => setNewSnippetTitle(e.target.value)}
                placeholder="Enter a title for this snippet..."
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Selected Text</Label>
              <div className="p-2 bg-muted rounded-md text-xs font-mono max-h-32 overflow-y-auto whitespace-pre-wrap">
                {selectedText}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddSnippetDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSnippet}>
              Save Snippet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
