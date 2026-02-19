import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore } from '@/store/workflowStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Workflow } from '@/types/workflow';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface MoveToCanvasDialogProps {
  nodeIds: string[];
  onClose: () => void;
}

export function MoveToCanvasDialog({ nodeIds, onClose }: MoveToCanvasDialogProps) {
  const navigate = useNavigate();
  const { 
    workflow, 
    loadWorkflows, 
    loadWorkflow, 
    clearSelection,
    lockNavigation,
    unlockNavigation,
    saveWorkflowDirect,
  } = useWorkflowStore();
  
  const [availableWorkflows, setAvailableWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<'existing' | 'new'>('new');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');
  const [newWorkflowName, setNewWorkflowName] = useState('New Workflow');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const fetchWorkflows = async () => {
      setIsLoading(true);
      const workflows = await loadWorkflows();
      // Filter out the current workflow
      const filtered = workflows.filter(w => w.id !== workflow.id);
      setAvailableWorkflows(filtered);
      setIsLoading(false);
    };
    fetchWorkflows();
  }, [loadWorkflows, workflow.id]);

  const handleMove = async () => {
    if (mode === 'existing' && !selectedWorkflowId) {
      toast.error('Please select a workflow');
      return;
    }
    if (mode === 'new' && !newWorkflowName.trim()) {
      toast.error('Please enter a workflow name');
      return;
    }

    setIsProcessing(true);
    
    // CRITICAL: Lock navigation to prevent race conditions during multi-step operation
    lockNavigation();

    try {
      // Get the nodes and edges to move
      const selectedNodeSet = new Set(nodeIds);
      const nodesToMove = workflow.nodes.filter(n => selectedNodeSet.has(n.id));
      
      // Get edges that connect two selected nodes (internal edges)
      const edgesToMove = workflow.edges.filter(
        e => selectedNodeSet.has(e.from.node) && selectedNodeSet.has(e.to.node)
      );

      // Calculate bounding box to reposition nodes
      const minX = Math.min(...nodesToMove.map(n => n.position.x));
      const minY = Math.min(...nodesToMove.map(n => n.position.y));

      // Reposition nodes to start from (100, 100)
      const repositionedNodes = nodesToMove.map(n => ({
        ...n,
        position: {
          x: n.position.x - minX + 100,
          y: n.position.y - minY + 100,
        }
      }));

      // Remove nodes and edges from current workflow
      const remainingNodes = workflow.nodes.filter(n => !selectedNodeSet.has(n.id));
      const remainingEdges = workflow.edges.filter(
        e => !selectedNodeSet.has(e.from.node) && !selectedNodeSet.has(e.to.node)
      );

      // Step 1: Save current workflow with nodes removed (DIRECT API - no loadWorkflow)
      if (workflow.id && workflow.id !== '1' && !workflow.id.startsWith('temp-')) {
        const saveResult = await saveWorkflowDirect({
          id: workflow.id,
          name: workflow.name,
          nodes: remainingNodes,
          edges: remainingEdges,
          variables: workflow.variables,
          settings: workflow.settings,
          parent_id: workflow.parent_id,
          sort_order: workflow.sort_order,
        });
        
        if (!saveResult.success) {
          throw new Error(saveResult.error || 'Failed to save current workflow');
        }
      }

      if (mode === 'new') {
        // Step 2: Create new workflow with moved nodes (DIRECT API)
        const response = await supabase.functions.invoke('save-workflow', {
          body: {
            id: null, // Create new
            name: newWorkflowName.trim(),
            nodes: repositionedNodes,
            edges: edgesToMove,
            variables: [],
            _source: 'user',
            _transaction_id: `move-create-${Date.now()}`
          }
        });

        if (response.error) {
          throw new Error(response.error.message || 'Failed to create new workflow');
        }

        const newWorkflow = response.data;

        toast.success(`Moved ${nodeIds.length} nodes to new workflow "${newWorkflowName}"`);
        clearSelection();
        onClose();
        
        // ONLY NOW load the new workflow (single loadWorkflow call at the end)
        unlockNavigation();
        loadWorkflow(newWorkflow);
        navigate('/');
      } else {
        // Step 2: Update existing target workflow with added nodes (DIRECT API)
        const targetWorkflow = availableWorkflows.find(w => w.id === selectedWorkflowId);
        if (!targetWorkflow) {
          throw new Error('Target workflow not found');
        }

        const response = await supabase.functions.invoke('save-workflow', {
          body: {
            id: targetWorkflow.id,
            name: targetWorkflow.name,
            nodes: [...targetWorkflow.nodes, ...repositionedNodes],
            edges: [...targetWorkflow.edges, ...edgesToMove],
            variables: targetWorkflow.variables,
            settings: targetWorkflow.settings,
            _source: 'user',
            _transaction_id: `move-update-${Date.now()}`
          }
        });

        if (response.error) {
          throw new Error(response.error.message || 'Failed to update target workflow');
        }

        const updatedWorkflow = response.data;

        toast.success(`Moved ${nodeIds.length} nodes to "${targetWorkflow.name}"`);
        clearSelection();
        onClose();
        
        // ONLY NOW load the updated workflow (single loadWorkflow call at the end)
        unlockNavigation();
        loadWorkflow(updatedWorkflow);
      }
    } catch (error) {
      console.error('Error moving nodes:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to move nodes');
      unlockNavigation();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {nodeIds.length} Nodes</DialogTitle>
          <DialogDescription>
            Move selected nodes to another workflow canvas. Internal connections will be preserved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Mode Selection */}
          <div className="flex gap-2">
            <Button
              variant={mode === 'new' ? 'default' : 'outline'}
              onClick={() => setMode('new')}
              className="flex-1"
            >
              <Plus className="mr-2 h-4 w-4" />
              New Workflow
            </Button>
            <Button
              variant={mode === 'existing' ? 'default' : 'outline'}
              onClick={() => setMode('existing')}
              className="flex-1"
              disabled={availableWorkflows.length === 0}
            >
              Existing Workflow
            </Button>
          </div>

          {mode === 'new' ? (
            <div>
              <Label htmlFor="workflow_name">Workflow Name</Label>
              <Input
                id="workflow_name"
                value={newWorkflowName}
                onChange={(e) => setNewWorkflowName(e.target.value)}
                placeholder="Enter workflow name..."
              />
            </div>
          ) : (
            <div>
              <Label htmlFor="workflow_select">Select Workflow</Label>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading workflows...</p>
              ) : availableWorkflows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No other workflows available</p>
              ) : (
                <Select value={selectedWorkflowId} onValueChange={setSelectedWorkflowId}>
                  <SelectTrigger id="workflow_select">
                    <SelectValue placeholder="Choose a workflow..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableWorkflows.map((wf) => (
                      <SelectItem key={wf.id} value={wf.id}>
                        {wf.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleMove} disabled={isProcessing}>
            {isProcessing ? 'Moving...' : 'Move Nodes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
