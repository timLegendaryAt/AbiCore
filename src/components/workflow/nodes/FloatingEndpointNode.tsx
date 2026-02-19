import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { cn } from '@/lib/utils';
import type { NodeBase } from '@/types/workflow';

interface FloatingEndpointNodeProps {
  data: NodeBase;
  selected: boolean;
}

export const FloatingEndpointNode = memo(({ selected }: FloatingEndpointNodeProps) => (
  <div className={cn(
    "w-4 h-4 rounded-full border-2 border-muted-foreground bg-background cursor-move transition-all",
    selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
  )}>
    {/* Small handles at edges - nodrag class prevents them from blocking node drag */}
    <Handle 
      type="target" 
      position={Position.Top} 
      id="top"
      className="!w-2 !h-2 !bg-transparent !border-0 !-top-1 !left-1/2 !-translate-x-1/2 nodrag" 
    />
    <Handle 
      type="source" 
      position={Position.Top} 
      id="top"
      className="!w-2 !h-2 !bg-transparent !border-0 !-top-1 !left-1/2 !-translate-x-1/2 nodrag" 
    />
    <Handle 
      type="target" 
      position={Position.Bottom} 
      id="bottom"
      className="!w-2 !h-2 !bg-transparent !border-0 !-bottom-1 !left-1/2 !-translate-x-1/2 nodrag" 
    />
    <Handle 
      type="source" 
      position={Position.Bottom} 
      id="bottom"
      className="!w-2 !h-2 !bg-transparent !border-0 !-bottom-1 !left-1/2 !-translate-x-1/2 nodrag" 
    />
    <Handle 
      type="target" 
      position={Position.Left} 
      id="left"
      className="!w-2 !h-2 !bg-transparent !border-0 !-left-1 !top-1/2 !-translate-y-1/2 nodrag" 
    />
    <Handle 
      type="source" 
      position={Position.Left} 
      id="left"
      className="!w-2 !h-2 !bg-transparent !border-0 !-left-1 !top-1/2 !-translate-y-1/2 nodrag" 
    />
    <Handle 
      type="target" 
      position={Position.Right} 
      id="right"
      className="!w-2 !h-2 !bg-transparent !border-0 !-right-1 !top-1/2 !-translate-y-1/2 nodrag" 
    />
    <Handle 
      type="source" 
      position={Position.Right} 
      id="right"
      className="!w-2 !h-2 !bg-transparent !border-0 !-right-1 !top-1/2 !-translate-y-1/2 nodrag" 
    />
  </div>
));

FloatingEndpointNode.displayName = 'FloatingEndpointNode';
