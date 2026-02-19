import { useState, useEffect } from 'react';
import { useWorkflowStore } from '@/store/workflowStore';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Workflow } from '@/types/workflow';

interface WorkflowNodeInspectorProps {
  nodeId: string;
}

export function WorkflowNodeInspector({ nodeId }: WorkflowNodeInspectorProps) {
  const { workflow, updateNodeConfig, loadWorkflows } = useWorkflowStore();
  const [availableWorkflows, setAvailableWorkflows] = useState<Workflow[]>([]);
  const selectedNode = workflow.nodes.find(n => n.id === nodeId);

  useEffect(() => {
    const fetchWorkflows = async () => {
      const workflows = await loadWorkflows();
      // Filter out the current workflow to prevent circular references
      const filtered = workflows.filter(w => w.id !== workflow.id);
      setAvailableWorkflows(filtered);
    };
    fetchWorkflows();
  }, [loadWorkflows, workflow.id]);

  const handleWorkflowSelect = (workflowId: string) => {
    const selectedWorkflow = availableWorkflows.find(w => w.id === workflowId);
    if (selectedWorkflow) {
      updateNodeConfig(nodeId, {
        workflowId: selectedWorkflow.id,
        workflowName: selectedWorkflow.name,
      });
    }
  };

  if (!selectedNode) return null;

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="workflow_select">Select Workflow</Label>
        <Select 
          value={selectedNode.config.workflowId || ''} 
          onValueChange={handleWorkflowSelect}
        >
          <SelectTrigger id="workflow_select">
            <SelectValue placeholder="Choose a workflow..." />
          </SelectTrigger>
          <SelectContent>
            {availableWorkflows.length === 0 ? (
              <SelectItem value="none" disabled>No workflows available</SelectItem>
            ) : (
              availableWorkflows.map((wf) => (
                <SelectItem key={wf.id} value={wf.id}>
                  {wf.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {selectedNode.config.workflowName && (
        <div className="p-3 bg-muted rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">Selected Workflow</p>
          <p className="font-medium text-foreground">{selectedNode.config.workflowName}</p>
        </div>
      )}
    </div>
  );
}
