import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Edit, Bot, User } from 'lucide-react';
import { AIAgent, AITool } from '@/types/ai-agent';
import { useState } from 'react';
import { AIAgentDialog } from './AIAgentDialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';

interface AIAgentCardProps {
  agent: AIAgent;
  tools: AITool[];
  onUpdate: () => void;
}

export function AIAgentCard({ agent, tools, onUpdate }: AIAgentCardProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleToggleEnabled = async (enabled: boolean) => {
    setIsUpdating(true);
    const { error } = await supabase
      .from('ai_agents')
      .update({ enabled })
      .eq('id', agent.id);

    if (error) {
      toast.error('Failed to update agent status');
      console.error(error);
    } else {
      toast.success(`Agent ${enabled ? 'enabled' : 'disabled'}`);
      onUpdate();
    }
    setIsUpdating(false);
  };

  const assignedTools = agent.ai_agent_tools
    ?.map(at => tools.find(t => t.id === at.tool_id))
    .filter(Boolean) || [];

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {agent.type === 'user' ? (
                <User className="h-5 w-5 text-primary" />
              ) : (
                <Bot className="h-5 w-5 text-secondary" />
              )}
              <div>
                <CardTitle className="text-lg">{agent.name}</CardTitle>
                <CardDescription className="capitalize">{agent.type} Agent</CardDescription>
              </div>
            </div>
            <Switch
              checked={agent.enabled}
              onCheckedChange={handleToggleEnabled}
              disabled={isUpdating}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm">
              <span className="text-muted-foreground">Model:</span>{' '}
              <Badge variant="outline">{agent.model}</Badge>
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Temperature:</span> {agent.temperature}
            </div>
            <div className="text-sm">
              <span className="text-muted-foreground">Max Tokens:</span> {agent.max_tokens}
            </div>
          </div>

          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary">
              System Prompt <ChevronDown className="h-4 w-4" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md max-h-32 overflow-y-auto">
                {agent.system_prompt}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2">
            <div className="text-sm font-medium">Assigned Tools ({assignedTools.length})</div>
            <div className="flex flex-wrap gap-1">
              {assignedTools.length > 0 ? (
                assignedTools.map(tool => (
                  <Badge key={tool?.id} variant="secondary" className="text-xs">
                    {tool?.name}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">No tools assigned</span>
              )}
            </div>
          </div>

          <Button onClick={() => setShowDialog(true)} className="w-full" variant="outline">
            <Edit className="h-4 w-4 mr-2" />
            Edit Agent
          </Button>
        </CardContent>
      </Card>

      <AIAgentDialog
        open={showDialog}
        onOpenChange={setShowDialog}
        agent={agent}
        tools={tools}
        onSave={onUpdate}
      />
    </>
  );
}
