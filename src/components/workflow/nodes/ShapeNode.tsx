import { memo } from 'react';
import { NodeResizer } from 'reactflow';
import { Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useWorkflowStore } from '@/store/workflowStore';
import type { NodeBase, ShapeConfig } from '@/types/workflow';

interface ShapeNodeProps {
  data: NodeBase;
  selected: boolean;
}

export const ShapeNode = memo(({ data, selected }: ShapeNodeProps) => {
  const { duplicateNode, deleteNode } = useWorkflowStore();
  const config = data.config as ShapeConfig;

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateNode(data.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this shape?')) {
      deleteNode(data.id);
    }
  };
  
  const {
    borderWidth = 2,
    borderColor = '#94a3b8',
    borderStyle = 'dashed',
    borderRadius = 8,
    backgroundColor = 'transparent',
  } = config || {};

  const cssBorderStyle = borderStyle === 'dashed' ? 'dashed' : borderStyle === 'dotted' ? 'dotted' : 'solid';

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={100}
        minHeight={50}
        handleStyle={{ 
          width: 8, 
          height: 8,
          borderRadius: 2,
          backgroundColor: 'hsl(var(--primary))',
          border: 'none',
        }}
        lineStyle={{ 
          borderColor: 'hsl(var(--primary))',
          borderWidth: 1,
        }}
      />
      {/* Visual border - no pointer events */}
      <div
        className="transition-all w-full h-full pointer-events-none"
        style={{
          borderWidth,
          borderColor,
          borderStyle: cssBorderStyle,
          borderRadius,
          backgroundColor,
          minWidth: '100%',
          minHeight: '100%',
        }}
      />
      
      {/* Clickable edge strips - only capture clicks on borders */}
      {/* Top edge */}
      <div 
        className="absolute top-0 left-0 right-0 pointer-events-auto cursor-move"
        style={{ height: Math.max(borderWidth, 10), borderRadius: `${borderRadius}px ${borderRadius}px 0 0` }}
      />
      {/* Bottom edge */}
      <div 
        className="absolute bottom-0 left-0 right-0 pointer-events-auto cursor-move"
        style={{ height: Math.max(borderWidth, 10), borderRadius: `0 0 ${borderRadius}px ${borderRadius}px` }}
      />
      {/* Left edge */}
      <div 
        className="absolute top-0 bottom-0 left-0 pointer-events-auto cursor-move"
        style={{ width: Math.max(borderWidth, 10) }}
      />
      {/* Right edge */}
      <div 
        className="absolute top-0 bottom-0 right-0 pointer-events-auto cursor-move"
        style={{ width: Math.max(borderWidth, 10) }}
      />
      
      {/* Action buttons - appear when selected */}
      {selected && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1 pointer-events-auto">
          <Button
            variant="secondary"
            size="icon"
            className="h-6 w-6 rounded-full shadow-md"
            onClick={handleDuplicate}
            title="Duplicate"
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="h-6 w-6 rounded-full shadow-md"
            onClick={handleDelete}
            title="Delete"
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      )}
    </>
  );
});

ShapeNode.displayName = 'ShapeNode';
