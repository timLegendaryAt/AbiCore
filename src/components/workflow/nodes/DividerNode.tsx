import { memo } from 'react';
import { cn } from '@/lib/utils';
import type { NodeBase, DividerConfig } from '@/types/workflow';

interface DividerNodeProps {
  data: NodeBase;
  selected: boolean;
}

export const DividerNode = memo(({ data, selected }: DividerNodeProps) => {
  const config = data.config as DividerConfig;
  
  const {
    orientation = 'horizontal',
    length = 200,
    strokeWidth = 2,
    color = '#94a3b8',
    style = 'solid',
  } = config || {};

  const borderStyle = style === 'dashed' ? 'dashed' : style === 'dotted' ? 'dotted' : 'solid';

  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      className={cn(
        "transition-all cursor-move",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background rounded"
      )}
      style={{
        width: isHorizontal ? length : strokeWidth,
        height: isHorizontal ? strokeWidth : length,
        backgroundColor: style === 'solid' ? color : 'transparent',
        borderTop: !isHorizontal ? 'none' : `${strokeWidth}px ${borderStyle} ${color}`,
        borderLeft: isHorizontal ? 'none' : `${strokeWidth}px ${borderStyle} ${color}`,
      }}
    />
  );
});

DividerNode.displayName = 'DividerNode';
