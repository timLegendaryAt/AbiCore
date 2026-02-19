import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { AIAgent, AITool, AI_MODELS } from '@/types/ai-agent';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AIAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: AIAgent;
  tools: AITool[];
  onSave: () => void;
}

export function AIAgentDialog({ open, onOpenChange, agent, tools, onSave }: AIAgentDialogProps) {
  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [model, setModel] = useState('google/gemini-2.5-flash');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setSystemPrompt(agent.system_prompt);
      setModel(agent.model);
      setTemperature(agent.temperature);
      setMaxTokens(agent.max_tokens);
      setSelectedTools(agent.ai_agent_tools?.map(at => at.tool_id) || []);
    }
  }, [agent]);

  const handleSave = async () => {
    if (!name.trim() || !systemPrompt.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSaving(true);

    try {
      // Update agent
      const { error: agentError } = await supabase
        .from('ai_agents')
        .update({
          name,
          system_prompt: systemPrompt,
          model,
          temperature,
          max_tokens: maxTokens,
        })
        .eq('id', agent!.id);

      if (agentError) throw agentError;

      // Update tool assignments
      // First delete existing assignments
      await supabase
        .from('ai_agent_tools')
        .delete()
        .eq('agent_id', agent!.id);

      // Then insert new assignments
      if (selectedTools.length > 0) {
        const { error: toolsError } = await supabase
          .from('ai_agent_tools')
          .insert(selectedTools.map(toolId => ({
            agent_id: agent!.id,
            tool_id: toolId,
          })));

        if (toolsError) throw toolsError;
      }

      toast.success('Agent updated successfully');
      onSave();
      onOpenChange(false);
    } catch (error) {
      console.error('Error saving agent:', error);
      toast.error('Failed to save agent');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToolToggle = (toolId: string) => {
    setSelectedTools(prev =>
      prev.includes(toolId)
        ? prev.filter(id => id !== toolId)
        : [...prev, toolId]
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit {agent?.type === 'user' ? 'User' : 'System'} Agent</DialogTitle>
          <DialogDescription>
            Configure the agent's behavior, model settings, and available tools.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Agent Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter agent name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="system-prompt">System Prompt</Label>
            <Textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Enter system prompt that defines the agent's behavior"
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map(m => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="temperature">Temperature: {temperature}</Label>
            <Slider
              id="temperature"
              min={0}
              max={1}
              step={0.1}
              value={[temperature]}
              onValueChange={([value]) => setTemperature(value)}
            />
            <p className="text-xs text-muted-foreground">
              Higher values make output more random, lower values more focused
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-tokens">Max Tokens</Label>
            <Input
              id="max-tokens"
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              min={100}
              max={10000}
            />
          </div>

          <div className="space-y-2">
            <Label>Assigned Tools</Label>
            <div className="border rounded-md p-4 space-y-3 max-h-48 overflow-y-auto">
              {tools.map(tool => (
                <div key={tool.id} className="flex items-start space-x-2">
                  <Checkbox
                    id={tool.id}
                    checked={selectedTools.includes(tool.id)}
                    onCheckedChange={() => handleToolToggle(tool.id)}
                  />
                  <div className="flex-1">
                    <label
                      htmlFor={tool.id}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {tool.name}
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {tool.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
