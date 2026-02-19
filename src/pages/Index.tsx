import { useState, useEffect } from 'react';
import { NodePalette } from '@/components/workflow/NodePalette';
import { WorkflowCanvas } from '@/components/workflow/WorkflowCanvas';
import { InspectorPanel } from '@/components/workflow/InspectorPanel';
import { AIConversationPanel } from '@/components/workflow/AIConversationPanel';
import { BottomBar } from '@/components/workflow/BottomBar';
import { ValidationBanner } from '@/components/workflow/ValidationBanner';
import { useWorkflowStore } from '@/store/workflowStore';
import { toast } from 'sonner';
import { WorkflowHeader } from '@/components/workflow/WorkflowHeader';

const Index = () => {
  const { 
    workflow, 
    setValidationErrors, 
    validationErrors, 
    initializeWorkflow, 
    isLoading, 
    currentLayer, 
    isAIConversationOpen,
    selectedNodeIds,
    runTestNodes,
    isTestRunning
  } = useWorkflowStore();
  const [showValidationBanner, setShowValidationBanner] = useState(false);

  useEffect(() => {
    initializeWorkflow();
  }, []);

  const handleValidate = async () => {
    // If nodes are selected, run them as tests instead of validation
    if (selectedNodeIds.length > 0) {
      await runTestNodes(selectedNodeIds);
      return;
    }
    
    // Otherwise, run validation checks
    const errors: string[] = [];

    // Check for cycles (simplified - would need proper graph traversal)
    if (workflow.nodes.length > 0 && workflow.edges.length === 0) {
      errors.push('No connections between nodes');
    }

    // Check required fields for each node type
    workflow.nodes.forEach(node => {
      if (node.type === 'promptTemplate') {
        if (!node.config.name) errors.push(`Prompt Template "${node.label}" missing name`);
        if (!node.config.model) errors.push(`Prompt Template "${node.label}" missing model`);
      }
      if (node.type === 'dataset' && !node.config.source) {
        errors.push(`Dataset "${node.label}" missing source`);
      }
      if (node.type === 'variable' && !node.config.name) {
        errors.push(`Variable "${node.label}" missing name`);
      }
    });

    setValidationErrors(errors);

    if (errors.length > 0) {
      setShowValidationBanner(true);
      toast.error('Validation failed - see errors above');
    } else {
      toast.success('Validation passed!');
      setShowValidationBanner(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full w-full bg-background items-center justify-center">
        <div className="text-muted-foreground">Loading workflow...</div>
      </div>
    );
  }

  // Determine validate button text based on selection
  const validateButtonText = selectedNodeIds.length > 0 
    ? `Run ${selectedNodeIds.length} Node${selectedNodeIds.length > 1 ? 's' : ''}`
    : 'Validate';

  return (
    <div className="flex flex-col h-full w-full bg-background">
      <WorkflowHeader />
      
      {showValidationBanner && (
        <ValidationBanner
          errors={validationErrors}
          onClose={() => setShowValidationBanner(false)}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        <NodePalette onNodeDragStart={() => {}} isVisible={currentLayer === 'framework'} />
        <WorkflowCanvas />
        {isAIConversationOpen ? <AIConversationPanel /> : <InspectorPanel />}
      </div>

      <BottomBar 
        onValidate={handleValidate} 
        validateButtonText={validateButtonText}
        isValidating={isTestRunning}
      />
    </div>
  );
};

export default Index;
