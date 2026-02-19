import { useWorkflowStore } from '@/store/workflowStore';
import { PromptBuilder } from '@/components/workflow/PromptBuilder';
import { PromptPart } from '@/types/workflow';
import { Integration } from '@/types/integration';
import { supabase } from '@/integrations/supabase/client';
import { Info } from 'lucide-react';
import { useState, useEffect } from 'react';
export function PromptBuilderTab() {
  const {
    workflow,
    selectedNodeIds,
    updateNodeConfig
  } = useWorkflowStore();
  const selectedNode = selectedNodeIds.length === 1 
    ? workflow.nodes.find(n => n.id === selectedNodeIds[0])
    : undefined;
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  useEffect(() => {
    const fetchIntegrations = async () => {
      const { data } = await supabase
        .from('integrations')
        .select('*')
        .eq('connected', true);
      
      if (data) {
        setIntegrations(data as Integration[]);
      }
    };
    
    fetchIntegrations();
  }, []);

  // Only show for promptTemplate nodes (Generate nodes)
  const supportsPromptBuilder = selectedNode?.type === 'promptTemplate';
  if (!selectedNode) {
    return <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Info className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-foreground mb-2">No node selected</h3>
        <p className="text-sm text-muted-foreground">Select a node to build prompts</p>
      </div>;
  }
  if (!supportsPromptBuilder) {
    return <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <Info className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-foreground mb-2">Prompt Builder Not Available</h3>
        <p className="text-sm text-muted-foreground">
          This node type ({selectedNode.type}) doesn't support the prompt builder.
          Only Generate nodes can use this feature.
        </p>
      </div>;
  }
  const getAvailableDependencies = () => {
    return workflow.nodes.filter(node => node.id !== selectedNode?.id).map(node => ({
      id: node.id,
      label: node.label
    }));
  };

  // Migrate old dependencies to new promptParts format
  const migrateToPromptParts = (config: any): PromptPart[] => {
    if (config.promptParts) return config.promptParts;
    if (!config.dependencies || config.dependencies.length === 0) return [];
    return config.dependencies.map((depLabel: string, index: number) => {
      const node = workflow.nodes.find(n => n.label === depLabel);
      return {
        id: crypto.randomUUID(),
        type: 'dependency' as const,
        value: node?.id || depLabel,
        order: index
      };
    });
  };
  const handlePromptPartsChange = (parts: PromptPart[]) => {
    updateNodeConfig(selectedNode.id, {
      promptParts: parts
    });
    // Clear old dependencies field
    if (selectedNode?.config.dependencies) {
      updateNodeConfig(selectedNode.id, {
        dependencies: undefined
      });
    }
  };
  return (
    <PromptBuilder 
      promptParts={migrateToPromptParts(selectedNode.config)} 
      availableNodes={getAvailableDependencies()} 
      integrations={integrations} 
      onChange={handlePromptPartsChange} 
    />
  );
}