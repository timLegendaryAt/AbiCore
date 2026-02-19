import { useCallback, useRef, useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Node,
  Edge,
  NodeTypes,
  EdgeTypes,
  ReactFlowInstance,
  OnConnectStart,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useWorkflowStore } from '@/store/workflowStore';
import { WorkflowNode } from './nodes/WorkflowNode';
import { NoteNode } from './nodes/NoteNode';
import { DividerNode } from './nodes/DividerNode';
import { ShapeNode } from './nodes/ShapeNode';
import { FloatingEndpointNode } from './nodes/FloatingEndpointNode';
import { CustomEdge } from './CustomEdge';
import { ImprovementOverlay } from './ImprovementOverlay';
import { CascadeStatusOverlay } from './CascadeStatusOverlay';
import { PerformanceOverlay } from './PerformanceOverlay';
import { CanvasContextMenu } from './CanvasContextMenu';
import { NodeBase } from '@/types/workflow';
import { useSaveOnDeselection, getBackup, clearBackup, type BackupData } from '@/hooks/useSaveOnEvent';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

const nodeTypes: NodeTypes = {
  custom: WorkflowNode,
  note: NoteNode,
  divider: DividerNode,
  shape: ShapeNode,
  floatingEndpoint: FloatingEndpointNode,
};

const edgeTypes: EdgeTypes = {
  default: CustomEdge,
};

export function WorkflowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance | null>(null);
  // Track workflow structure to detect real changes (not React Flow internal updates)
  const prevWorkflowRef = useRef<{ 
    workflowId: string;
    nodeIds: string; 
    edgeIds: string;
  }>({ workflowId: '', nodeIds: '', edgeIds: '' });
  const { 
    workflow, 
    selectedNodeIds, 
    addNode, 
    addEdge: addWorkflowEdge, 
    setSelectedNodes, 
    toggleSelection,
    clearSelection,
    deleteNode, 
    deleteEdge, 
    deleteSelectedNodes,
    updateNode,
    updateNodeConfig,
    currentLayer,
    improvementData,
    getImprovementDataForNode,
    loadWorkflow,
  } = useWorkflowStore();

  // Recovery dialog state
  const [recoveryBackup, setRecoveryBackup] = useState<BackupData | null>(null);
  
  // Delete confirmation dialog state
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Event-driven save: save on deselection + beacon on unload
  useSaveOnDeselection();

  // Listen for backup recovery events
  useEffect(() => {
    const handleRecovery = (e: CustomEvent<BackupData>) => {
      setRecoveryBackup(e.detail);
    };
    window.addEventListener('backupRecoveryAvailable', handleRecovery as EventListener);
    return () => window.removeEventListener('backupRecoveryAvailable', handleRecovery as EventListener);
  }, []);

  // Intercept Delete/Backspace to show confirmation instead of silent deletion
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't intercept if user is typing in an input/textarea
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
        
        if (selectedNodeIds.length > 0) {
          e.preventDefault();
          e.stopPropagation();
          setDeleteConfirmOpen(true);
        }
      }
    };
    
    document.addEventListener('keydown', handleKeyDown, true); // capture phase
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [selectedNodeIds]);

  const handleRecoverBackup = useCallback(() => {
    if (!recoveryBackup) return;
    
    // Load the backup into the current workflow
    const currentWorkflow = useWorkflowStore.getState().workflow;
    
    // Only recover if it's the same workflow
    if (currentWorkflow.id === recoveryBackup.workflowId) {
      useWorkflowStore.setState((state) => ({
        workflow: {
          ...state.workflow,
          nodes: recoveryBackup.nodes,
          edges: recoveryBackup.edges,
          variables: recoveryBackup.variables,
          settings: recoveryBackup.settings,
          unsavedChanges: true,
        }
      }));
      toast.success('Changes recovered successfully');
    } else {
      // Different workflow - navigate to it first, then apply changes
      // For now, just notify the user
      toast.info(`Backup is for "${recoveryBackup.workflowName}" - navigate there to recover`);
    }
    
    clearBackup();
    setRecoveryBackup(null);
  }, [recoveryBackup]);

  const handleDiscardBackup = useCallback(() => {
    clearBackup();
    setRecoveryBackup(null);
    toast.info('Backup discarded');
  }, []);

  // Helper to get heatmap color based on score
  const getHeatmapColor = (score: number): string => {
    if (score >= 80) return '142 71% 45%'; // green
    if (score >= 60) return '38 92% 50%'; // yellow
    return '0 84% 60%'; // red
  };

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    flowPosition: { x: number; y: number };
  } | null>(null);
  
  // Track connection start for dangling edge creation
  const connectStartRef = useRef<{
    nodeId: string | null;
    handleId: string | null;
  }>({ nodeId: null, handleId: null });
  
  // Track if onConnect was called (successful connection) to prevent double line creation
  const connectionSuccessRef = useRef<boolean>(false);

  // Convert our workflow nodes to React Flow format
  const rfNodes: Node[] = workflow.nodes.map(node => ({
    id: node.id,
    type: node.type === 'note' ? 'note' : 
          node.type === 'divider' ? 'divider' : 
          node.type === 'shape' ? 'shape' : 
          node.type === 'floatingEndpoint' ? 'floatingEndpoint' : 'custom',
    position: node.position,
    data: node,
    // Set initial dimensions and z-index for shape nodes (behind other nodes)
    ...(node.type === 'shape' && node.config ? {
      style: { width: node.config.width || 300, height: node.config.height || 200 },
      zIndex: -1,
    } : {}),
    // Don't set 'selected' - let React Flow manage selection state internally
  }));

  const rfEdges: Edge[] = workflow.edges.map(edge => {
    const sourceNode = workflow.nodes.find(n => n.id === edge.from.node);
    const targetNode = workflow.nodes.find(n => n.id === edge.to.node);
    const isFloatingLine = !!(
      sourceNode?.type === 'floatingEndpoint' && 
      targetNode?.type === 'floatingEndpoint'
    );
    
    return {
      id: edge.id,
      source: edge.from.node,
      target: edge.to.node,
      sourceHandle: edge.from.port,
      targetHandle: edge.to.port,
      data: {
        onDelete: deleteEdge,
        isFloatingLine,
      },
    };
  });

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  // Sync nodes and edges when workflow changes
  // Simple logic: workflow ID change = apply store positions, otherwise preserve React Flow positions
  useEffect(() => {
    const workflowNodeIds = workflow.nodes.map(n => n.id).sort().join(',');
    const workflowEdgeIds = workflow.edges.map(e => e.id).sort().join(',');
    
    const workflowChanged = prevWorkflowRef.current.workflowId !== workflow.id;
    const nodesChanged = prevWorkflowRef.current.nodeIds !== workflowNodeIds;
    const edgesChanged = prevWorkflowRef.current.edgeIds !== workflowEdgeIds;
    
    // Update ref for next comparison
    prevWorkflowRef.current = { 
      workflowId: workflow.id,
      nodeIds: workflowNodeIds, 
      edgeIds: workflowEdgeIds
    };
    
    // If workflow switched or structure changed, update nodes
    if (workflowChanged || nodesChanged) {
      setNodes(prevNodes => {
        // Preserve React Flow's positions ONLY if same workflow and node exists
        const currentPositions = workflowChanged 
          ? new Map<string, { x: number; y: number }>() 
          : new Map(prevNodes.map(n => [n.id, n.position]));
        const currentSelections = new Map(prevNodes.map(n => [n.id, n.selected]));
        
        return workflow.nodes.map(node => ({
          id: node.id,
          type: node.type === 'note' ? 'note' : 
                node.type === 'divider' ? 'divider' :
                node.type === 'shape' ? 'shape' :
                node.type === 'floatingEndpoint' ? 'floatingEndpoint' : 'custom',
          // Use React Flow position if node exists and same workflow, else use store position
          position: currentPositions.get(node.id) || node.position,
          data: node,
          selected: currentSelections.get(node.id) || false,
          // Set dimensions and z-index for shape nodes (behind other nodes)
          ...(node.type === 'shape' && node.config ? {
            style: { width: node.config.width || 300, height: node.config.height || 200 },
            zIndex: -1,
          } : {}),
        }));
      });
      
      // Auto-fit view when switching to a different workflow
      if (workflowChanged && reactFlowInstance.current) {
        // Use longer delay to ensure nodes are fully rendered
        setTimeout(() => {
          reactFlowInstance.current?.fitView({ 
            padding: 0.2,
            duration: 400,
            maxZoom: 1.5,
          });
        }, 150);
      }
    } else {
      // Only data changed, preserve positions and selection
      setNodes(prevNodes => 
        prevNodes.map(node => {
          const workflowNode = workflow.nodes.find(n => n.id === node.id);
          return workflowNode ? { ...node, data: workflowNode } : node;
        })
      );
    }
    
    // Sync edges if changed
    if (edgesChanged) {
      setEdges(workflow.edges.map(edge => {
        const sourceNode = workflow.nodes.find(n => n.id === edge.from.node);
        const targetNode = workflow.nodes.find(n => n.id === edge.to.node);
        const isFloatingLine = !!(
          sourceNode?.type === 'floatingEndpoint' && 
          targetNode?.type === 'floatingEndpoint'
        );
        
        return {
          id: edge.id,
          source: edge.from.node,
          target: edge.to.node,
          sourceHandle: edge.from.port,
          targetHandle: edge.to.port,
          data: { onDelete: deleteEdge, isFloatingLine },
        };
      }));
    }
  }, [workflow.id, workflow.nodes, workflow.edges, deleteEdge, setNodes, setEdges]);

  // Sync React Flow changes back to our store
  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes);
    
    // Sync ALL position changes to store (during AND after drag)
    // This ensures positions are always saved correctly
    const positionChanges = changes.filter((change: any) => 
      change.type === 'position' && change.position
    );
    
    // Apply all position updates to store synchronously
    if (positionChanges.length > 0) {
      positionChanges.forEach((change: any) => {
        updateNode(change.id, { position: change.position });
      });
    }
    
    // Handle dimension changes for resizable nodes (shapes)
    const dimensionChanges = changes.filter((change: any) => 
      change.type === 'dimensions' && change.dimensions
    );
    
    dimensionChanges.forEach((change: any) => {
      const node = workflow.nodes.find(n => n.id === change.id);
      if (node?.type === 'shape') {
        updateNodeConfig(change.id, {
          width: change.dimensions.width,
          height: change.dimensions.height,
        });
      }
    });
  }, [onNodesChange, updateNode, updateNodeConfig, workflow.nodes]);

  const handleEdgesChange = useCallback((changes: any) => {
    onEdgesChange(changes);
    
    // Handle edge deletions - sync to store to prevent reappearing lines
    changes.forEach((change: any) => {
      if (change.type === 'remove') {
        deleteEdge(change.id);
      }
    });
  }, [onEdgesChange, deleteEdge]);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      
      // Mark that a valid connection was made - prevents onConnectEnd from creating floating endpoint
      connectionSuccessRef.current = true;
      
      const newEdge = {
        id: `e${connection.source}-${connection.target}-${Date.now()}`,
        from: { node: connection.source, port: connection.sourceHandle || 'bottom' },
        to: { node: connection.target, port: connection.targetHandle || 'top' },
      };
      
      addWorkflowEdge(newEdge);
      // The useEffect will detect the structure change and add it to ReactFlow
    },
    [addWorkflowEdge]
  );

  // Track connection start for dangling edges
  const onConnectStart: OnConnectStart = useCallback(
    (event, { nodeId, handleId }) => {
      connectStartRef.current = { nodeId, handleId };
    },
    []
  );

  // Handle connection dropped on empty canvas - create floating endpoint
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      // If a valid connection was made via onConnect, don't create floating endpoint
      if (connectionSuccessRef.current) {
        connectionSuccessRef.current = false;
        connectStartRef.current = { nodeId: null, handleId: null };
        return;
      }
      
      const { nodeId, handleId } = connectStartRef.current;
      
      // Only create floating endpoint if we started from a node
      if (nodeId) {
        const { clientX, clientY } = 
          'changedTouches' in event ? event.changedTouches[0] : event;
        
        const flowPosition = reactFlowInstance.current?.screenToFlowPosition({
          x: clientX,
          y: clientY,
        });
        
        if (flowPosition) {
          // Create a floating endpoint for this dangling edge
          const endpointId = `floating-endpoint-${Date.now()}`;
          
          // Add floating endpoint node at drop position
          addNode({
            id: endpointId,
            type: 'floatingEndpoint',
            label: '',
            position: flowPosition,
            ports: [
              { id: 'top', kind: 'text', direction: 'in' },
              { id: 'bottom', kind: 'text', direction: 'in' },
              { id: 'left', kind: 'text', direction: 'in' },
              { id: 'right', kind: 'text', direction: 'in' },
            ],
            config: {},
          });
          
          // Create edge from source to floating endpoint
          addWorkflowEdge({
            id: `e${nodeId}-${endpointId}-${Date.now()}`,
            from: { 
              node: nodeId, 
              port: handleId || 'bottom' 
            },
            to: { node: endpointId, port: 'top' },
          });
        }
      }
      
      // Reset connection start state
      connectStartRef.current = { nodeId: null, handleId: null };
    },
    [addNode, addWorkflowEdge]
  );

  const onSelectionChange = useCallback(
    (params: { nodes: Node[]; edges: Edge[] }) => {
      if (params.edges.length > 0) {
        // Edge selected - clear node selection
        clearSelection();
      } else if (params.nodes.length > 0) {
        // Single or multiple nodes selected
        setSelectedNodes(params.nodes.map(n => n.id));
      } else {
        // Nothing selected
        clearSelection();
      }
    },
    [setSelectedNodes, clearSelection]
  );

  const onEdgeClick = useCallback(
    (event: React.MouseEvent | MouseEvent, edge: Edge) => {
      event.stopPropagation();
      clearSelection();
    },
    [clearSelection]
  );

  const onPaneClick = useCallback(() => {
    clearSelection();
    setContextMenu(null);
  }, [clearSelection]);

  const onPaneContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    
    if (!reactFlowInstance.current) return;
    
    const flowPosition = reactFlowInstance.current.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      flowPosition,
    });
  }, []);

  const handleAddDivider = useCallback(() => {
    if (!contextMenu) return;
    
    const timestamp = Date.now();
    const startId = `floating-endpoint-${timestamp}-start`;
    const endId = `floating-endpoint-${timestamp}-end`;
    
    // Create start endpoint
    addNode({
      id: startId,
      type: 'floatingEndpoint',
      label: '',
      position: contextMenu.flowPosition,
      ports: [
        { id: 'top', kind: 'text', direction: 'in' },
        { id: 'bottom', kind: 'text', direction: 'out' },
        { id: 'left', kind: 'text', direction: 'in' },
        { id: 'right', kind: 'text', direction: 'out' },
      ],
      config: {},
    });
    
    // Create end endpoint 200px to the right
    addNode({
      id: endId,
      type: 'floatingEndpoint',
      label: '',
      position: { 
        x: contextMenu.flowPosition.x + 200, 
        y: contextMenu.flowPosition.y 
      },
      ports: [
        { id: 'top', kind: 'text', direction: 'in' },
        { id: 'bottom', kind: 'text', direction: 'out' },
        { id: 'left', kind: 'text', direction: 'in' },
        { id: 'right', kind: 'text', direction: 'out' },
      ],
      config: {},
    });
    
    // Create edge between them
    addWorkflowEdge({
      id: `e${startId}-${endId}`,
      from: { node: startId, port: 'right' },
      to: { node: endId, port: 'left' },
    });
    
    setContextMenu(null);
  }, [contextMenu, addNode, addWorkflowEdge]);

  const handleAddShape = useCallback(() => {
    if (!contextMenu) return;
    addNode({
      id: `shape-${Date.now()}`,
      type: 'shape',
      label: '',
      position: contextMenu.flowPosition,
      ports: [],
      config: {
        width: 300,
        height: 200,
        borderWidth: 2,
        borderColor: '#94a3b8',
        borderStyle: 'dashed',
        borderRadius: 8,
        backgroundColor: 'transparent',
      },
    });
    setContextMenu(null);
  }, [contextMenu, addNode]);

  const handleAddNote = useCallback(() => {
    if (!contextMenu) return;
    addNode({
      id: `note-${Date.now()}`,
      type: 'note',
      label: 'Note',
      position: contextMenu.flowPosition,
      ports: [],
      config: {
        text: '',
        fontSize: 'medium',
        color: '#6366f1',
      },
    });
    setContextMenu(null);
  }, [contextMenu, addNode]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowInstance.current) return;

      const position = reactFlowInstance.current.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: NodeBase = {
        id: `${type}-${Date.now()}`,
        type: type as any,
        label: type === 'promptTemplate' ? 'Generate' :
               type === 'promptPiece' ? 'Component' :
               type === 'dataset' ? 'Dataset' :
               type === 'variable' ? 'Transformation' :
               type === 'framework' ? 'Framework' :
               type === 'note' ? 'Note' : type,
        position,
        ports: type === 'note' ? [] : [
          { id: 'top', kind: 'text', direction: 'in' },
          { id: 'bottom', kind: 'text', direction: 'out' },
          { id: 'left', kind: 'text', direction: 'in' },
          { id: 'right', kind: 'text', direction: 'out' },
        ],
        config: type === 'promptTemplate' ? {
          name: '',
          model: 'google/gemini-3-flash-preview',
          system_prompt: '',
          temperature: 0.7,
          max_tokens: 8000,
        } : type === 'promptPiece' ? {
          content: '',
          append_newline: true,
        } : type === 'dataset' ? {
          source: '',
          path: '',
          sample_size: 10,
        } : type === 'variable' ? {
          name: '',
          type: 'string',
          default: '',
          scope: 'global',
        } : type === 'note' ? {
          text: 'New Note',
          fontSize: 'medium',
          color: '#6366f1',
        } : {},
      };

      addNode(newNode);
    },
    [addNode]
  );

  return (
    <div ref={reactFlowWrapper} className="flex-1 bg-canvas-bg relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onEdgeClick={onEdgeClick}
        onSelectionChange={onSelectionChange}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onInit={(instance) => {
          reactFlowInstance.current = instance;
          // Auto-fit on initial load with delay to ensure nodes are rendered
          setTimeout(() => {
            instance.fitView({ 
              padding: 0.2,
              duration: 400,
              maxZoom: 1.5,
            });
          }, 150);
        }}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        elementsSelectable={true}
        edgesFocusable={true}
        selectNodesOnDrag={false}
        selectionOnDrag={true}
        selectionKeyCode={null}
        panOnDrag={[2]}
        deleteKeyCode={null}
        multiSelectionKeyCode={["Shift", "Meta"]}
        minZoom={0.1}
        maxZoom={4}
        fitViewOptions={{
          padding: 0.2,
          maxZoom: 1.5,
        }}
        defaultEdgeOptions={{
          interactionWidth: 20,
        }}
      >
        <Background 
          color="#d5d5d5" 
          gap={20} 
          size={2} 
        />
        <Controls />
        {/* Improvement overlay layer - must be inside ReactFlow to use useViewport */}
        {currentLayer === 'improvement' && <ImprovementOverlay />}
        {/* Performance overlay layer */}
        {currentLayer === 'performance' && <PerformanceOverlay />}
        {/* Cascade status overlay - shows real-time execution progress */}
        <CascadeStatusOverlay />
      </ReactFlow>
      
      {/* Canvas context menu */}
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          flowPosition={contextMenu.flowPosition}
          onAddDivider={handleAddDivider}
          onAddShape={handleAddShape}
          onAddNote={handleAddNote}
          onClose={() => setContextMenu(null)}
        />
      )}
      
      {/* Delete confirmation dialog (keyboard-triggered) */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedNodeIds.length} node{selectedNodeIds.length !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const names = workflow.nodes
                  .filter(n => selectedNodeIds.includes(n.id))
                  .map(n => n.label)
                  .filter(Boolean)
                  .slice(0, 5);
                const remaining = selectedNodeIds.length - names.length;
                return (
                  <>
                    This will permanently remove: <strong>{names.join(', ')}</strong>
                    {remaining > 0 && ` and ${remaining} more`}.
                    This action cannot be undone.
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const count = selectedNodeIds.length;
                deleteSelectedNodes();
                toast.success(`Deleted ${count} node${count !== 1 ? 's' : ''}`);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Backup recovery dialog */}
      <AlertDialog open={recoveryBackup !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recover Unsaved Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Found unsaved changes to "{recoveryBackup?.workflowName}" from{' '}
              {recoveryBackup ? formatTimeAgo(recoveryBackup.backedUpAt) : ''}.
              Would you like to recover these changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDiscardBackup}>
              Discard
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleRecoverBackup}>
              Recover Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Helper to format time ago
function formatTimeAgo(timestamp: number): string {
  const minutesAgo = Math.round((Date.now() - timestamp) / 60000);
  if (minutesAgo < 1) return 'just now';
  if (minutesAgo === 1) return '1 minute ago';
  if (minutesAgo < 60) return `${minutesAgo} minutes ago`;
  const hoursAgo = Math.round(minutesAgo / 60);
  if (hoursAgo === 1) return '1 hour ago';
  return `${hoursAgo} hours ago`;
}
