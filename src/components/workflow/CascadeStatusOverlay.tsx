import { useWorkflowStore } from '@/store/workflowStore';
import { useViewport, useReactFlow, useNodesInitialized } from 'reactflow';
import { cn } from '@/lib/utils';

export function CascadeStatusOverlay() {
  const { workflow, cascadeProgress } = useWorkflowStore();
  const { x, y, zoom } = useViewport();
  const { getNodes } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  // Only show overlay when cascade is running or recently completed
  if (!cascadeProgress) {
    return null;
  }

  // Wait for React Flow to initialize nodes before rendering overlays
  if (!nodesInitialized) {
    return null;
  }

  const reactFlowNodes = getNodes();
  
  // Early return if no nodes available
  if (reactFlowNodes.length === 0) {
    return null;
  }
  
  // Get actual node dimensions from React Flow with safe fallbacks
  const getNodeDimensions = (nodeId: string) => {
    const rfNode = reactFlowNodes.find(n => n.id === nodeId);
    if (!rfNode) {
      return { width: 200, height: 80 };
    }
    const measured = (rfNode as any)?.measured;
    return {
      width: measured?.width ?? rfNode?.width ?? 200,
      height: measured?.height ?? rfNode?.height ?? 80,
    };
  };

  const { executingNodeIds = [], completedNodeIds = [], failedNodeId } = cascadeProgress;

  return (
    <div 
      className="absolute inset-0 pointer-events-none z-[15]"
      style={{
        transform: `translate(${x}px, ${y}px) scale(${zoom})`,
        transformOrigin: '0 0'
      }}
    >
      {workflow.nodes
        .filter(node => !['note', 'divider', 'shape', 'floatingEndpoint'].includes(node.type))
        .filter(node => node.config?.paused !== true)  // Skip paused nodes
        .map((node) => {
          const dimensions = getNodeDimensions(node.id);
          
          const isExecuting = executingNodeIds.includes(node.id);
          const isCompleted = completedNodeIds.includes(node.id);
          const isFailed = failedNodeId === node.id;

          // Only show indicators for nodes involved in the cascade
          const isInCascade = isExecuting || isCompleted || isFailed;
          if (!isInCascade) {
            return null;
          }

          return (
            <div
              key={node.id}
              className="absolute"
              style={{
                left: node.position.x + dimensions.width - 16,
                top: node.position.y + dimensions.height - 16,
              }}
            >
              {/* Status indicator dot */}
              <div
                className={cn(
                  "w-3 h-3 rounded-full shadow-md border border-white/50 transition-colors",
                  isExecuting && "bg-red-500 animate-pulse",
                  isCompleted && !isFailed && "bg-green-500",
                  isFailed && "bg-red-500"
                )}
                title={
                  isExecuting ? "Executing..." :
                  isCompleted ? "Completed" :
                  isFailed ? "Failed" :
                  "Idle"
                }
              />
            </div>
          );
        })}
    </div>
  );
}
