import { memo } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useWorkflowStore } from '@/store/workflowStore';
import type { NodeBase } from '@/types/workflow';

interface NoteNodeProps {
  data: NodeBase;
  selected: boolean;
}

const fontSizeMap = {
  small: 'text-sm',
  medium: 'text-base',
  large: 'text-xl font-semibold',
  xlarge: 'text-2xl font-bold',
  xxlarge: 'text-3xl font-bold',
  xxxlarge: 'text-4xl font-bold',
  'display-sm': 'text-5xl font-bold',
  'display-md': 'text-6xl font-bold',
  'display-lg': 'text-7xl font-bold',
};

const alignmentMap = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

export const NoteNode = memo(({ data, selected }: NoteNodeProps) => {
  const { duplicateNode, deleteNode } = useWorkflowStore();
  
  const config = data.config as { 
    text: string; 
    fontSize: 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge' | 'xxxlarge' | 'display-sm' | 'display-md' | 'display-lg'; 
    labelFontSize?: 'small' | 'medium' | 'large' | 'xlarge' | 'xxlarge' | 'xxxlarge' | 'display-sm' | 'display-md' | 'display-lg';
    textAlign: 'left' | 'center' | 'right'; 
    color: string 
  };
  
  const hasLabel = data.label && data.label.trim() !== '';
  const hasText = config.text && config.text.trim() !== '';
  
  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateNode(data.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${data.label || 'this note'}"?`)) {
      deleteNode(data.id);
    }
  };
  
  return (
    <div
      className={cn(
        "px-2 py-1 transition-all min-w-[200px] max-w-[400px] bg-background rounded relative",
        selected ? "bg-primary/5 outline-dashed outline-1 outline-primary/30" : ""
      )}
    >
      {hasLabel && (
        <div 
          className={cn(
            "break-words",
            fontSizeMap[config.labelFontSize || 'large'] || fontSizeMap.large,
            alignmentMap[config.textAlign] || alignmentMap.left,
            hasText ? "mb-1" : ""
          )}
          style={{ color: config.color }}
        >
          {data.label}
        </div>
      )}
      {hasText && (
        <div 
          className={cn(
            "whitespace-pre-wrap break-words text-muted-foreground",
            fontSizeMap[config.fontSize] || fontSizeMap.medium,
            alignmentMap[config.textAlign] || alignmentMap.left
          )}
        >
          {config.text}
        </div>
      )}
      {!hasLabel && !hasText && (
        <div className="text-muted-foreground text-sm">Empty note</div>
      )}
      
      {/* Action buttons - appear when selected */}
      {selected && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1">
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
    </div>
  );
});

NoteNode.displayName = 'NoteNode';
