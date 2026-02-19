import { useWorkflowStore } from '@/store/workflowStore';
import { useViewport, useReactFlow, useNodesInitialized } from 'reactflow';
import { cn } from '@/lib/utils';

export function ImprovementOverlay() {
  const { workflow, getImprovementDataForNode } = useWorkflowStore();
  const { x, y, zoom } = useViewport();
  const { getNodes } = useReactFlow();
  const nodesInitialized = useNodesInitialized();

  // Wait for React Flow to initialize nodes before rendering overlays
  if (!nodesInitialized) {
    return null;
  }
  
  // Get actual node dimensions from React Flow
  const reactFlowNodes = getNodes();
  
  // Early return if no nodes available
  if (reactFlowNodes.length === 0) {
    return null;
  }

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

  // Helper to get overlay background color
  // For improvement layer: higher score = better = green (100% = good)
  // 70-100% = Green (excellent quality)
  // 40-69% = Yellow (needs attention)
  // 0-39% = Red (problematic)
  const getOverlayColor = (score: number): string => {
    if (score >= 70) return 'rgba(16, 185, 129, 0.6)';  // Green - excellent
    if (score >= 40) return 'rgba(251, 191, 36, 0.6)';  // Yellow - moderate
    return 'rgba(239, 68, 68, 0.6)';                     // Red - needs attention
  };

  // Helper to get badge background color
  const getBadgeColor = (score: number): string => {
    if (score >= 70) return 'bg-green-500';
    if (score >= 40) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div 
      className="absolute inset-0 pointer-events-none z-[5]"
      style={{
        transform: `translate(${x}px, ${y}px) scale(${zoom})`,
        transformOrigin: '0 0'
      }}
    >
      {workflow.nodes
        .filter(node => node.type === 'promptTemplate') // Only Generative nodes
        .map((node) => {
          const dimensions = getNodeDimensions(node.id);
          const improvementData = getImprovementDataForNode(node.id);
          // Use overallScore directly (100% = good)
          const hasData = improvementData && improvementData.overallScore !== undefined;
          const qualityScore = improvementData?.overallScore ?? 50;

          return (
            <div
              key={node.id}
              className="absolute"
              style={{
                left: node.position.x,
                top: node.position.y,
                width: dimensions.width,
                height: dimensions.height,
              }}
            >
              {/* Colored overlay box */}
              <div
                className="absolute inset-0 rounded-lg border-2"
                style={{
                  background: hasData
                    ? `linear-gradient(135deg, ${getOverlayColor(qualityScore)} 0%, ${getOverlayColor(qualityScore).replace('0.6', '0.4')} 100%)`
                    : 'rgba(156, 163, 175, 0.3)', // Neutral gray when no data
                  borderColor: hasData
                    ? getOverlayColor(qualityScore).replace('0.6', '1.0')
                    : 'rgba(156, 163, 175, 0.6)',
                  boxShadow: hasData
                    ? `0 0 20px ${getOverlayColor(qualityScore).replace('0.6', '0.5')}`
                    : 'none'
                }}
              />
              
              {/* Score badge - only show when there's actual data */}
              {hasData && (
                <div className={cn(
                  "absolute -top-3 -right-3 rounded-full px-4 py-2 text-base font-bold shadow-2xl border-[3px] border-white pointer-events-auto",
                  getBadgeColor(qualityScore),
                  "text-white"
                )}>
                  {qualityScore}%
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
