import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath, getStraightPath } from 'reactflow';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  data,
}: EdgeProps) {
  // Only use straight path when isFloatingLine is explicitly true
  // This ensures node-to-node connections always use curved bezier paths
  const isFloatingLine = data?.isFloatingLine === true;
  
  const [edgePath, labelX, labelY] = isFloatingLine 
    ? getStraightPath({ sourceX, sourceY, targetX, targetY })
    : getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
      });

  const onDelete = () => {
    if (data?.onDelete) {
      data.onDelete(id);
    }
  };

  return (
    <>
      <BaseEdge 
        id={id} 
        path={edgePath}
        style={{
          stroke: selected ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <Button
              size="icon"
              variant="destructive"
              className="h-6 w-6 rounded-full shadow-lg"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
