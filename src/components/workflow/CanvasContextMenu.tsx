import { useEffect, useRef } from 'react';
import { Minus, Square, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  flowPosition: { x: number; y: number };
  onAddDivider: () => void;
  onAddShape: () => void;
  onAddNote: () => void;
  onClose: () => void;
}

export function CanvasContextMenu({
  x,
  y,
  flowPosition,
  onAddDivider,
  onAddShape,
  onAddNote,
  onClose,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to keep menu in viewport
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 180);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] bg-popover border border-border rounded-lg shadow-lg py-1 animate-in fade-in-0 zoom-in-95"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <button
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 text-sm text-popover-foreground",
          "hover:bg-accent hover:text-accent-foreground transition-colors"
        )}
        onClick={onAddDivider}
      >
        <Minus className="w-4 h-4" />
        <span>Add Divider Line</span>
      </button>
      
      <button
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 text-sm text-popover-foreground",
          "hover:bg-accent hover:text-accent-foreground transition-colors"
        )}
        onClick={onAddShape}
      >
        <Square className="w-4 h-4" />
        <span>Add Shape</span>
      </button>

      <div className="my-1 border-t border-border" />

      <button
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 text-sm text-popover-foreground",
          "hover:bg-accent hover:text-accent-foreground transition-colors"
        )}
        onClick={onAddNote}
      >
        <StickyNote className="w-4 h-4" />
        <span>Add Note</span>
      </button>
    </div>
  );
}

