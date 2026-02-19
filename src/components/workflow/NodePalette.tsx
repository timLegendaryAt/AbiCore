import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, LayoutGrid, Wand2, Palette, Cable, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { 
  defaultPaletteItems, 
  PaletteItem, 
  iconRegistry, 
  defaultIconNames,
  NodeCustomizations 
} from '@/lib/nodeDefaults';

interface NodePaletteProps {
  onNodeDragStart: (type: string) => void;
  isVisible?: boolean;
}

interface CustomizedPaletteItem extends Omit<PaletteItem, 'icon'> {
  icon: LucideIcon;
}

export function NodePalette({ onNodeDragStart, isVisible = true }: NodePaletteProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'transform' | 'design' | 'connect'>('all');
  const [customizedItems, setCustomizedItems] = useState<CustomizedPaletteItem[]>(defaultPaletteItems);
  
  useEffect(() => {
    const loadCustomizations = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('node_palette_customizations')
        .maybeSingle();
      
      if (data?.node_palette_customizations) {
        const customizations = data.node_palette_customizations as NodeCustomizations;
        const merged = defaultPaletteItems
          .map(item => {
            const custom = customizations[item.type];
            const iconName = custom?.icon || defaultIconNames[item.type];
            const ResolvedIcon = iconRegistry[iconName] || item.icon;
            
            return {
              ...item,
              title: custom?.title || item.title,
              description: custom?.description || item.description,
              category: custom?.category || item.category,
              disabled: custom?.enabled === false,
              icon: ResolvedIcon,
            };
          })
          .filter(item => !item.disabled); // Filter out disabled nodes
        setCustomizedItems(merged);
      }
    };
    
    loadCustomizations();
  }, []);

  if (!isVisible) return null;
  
  const handleDragStart = (e: React.DragEvent, type: string) => {
    if (customizedItems.find(item => item.type === type)?.disabled) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/reactflow', type);
    onNodeDragStart(type);
  };

  return (
    <div className={cn(
      "bg-palette-bg border-r border-border flex flex-col h-full relative transition-all duration-300 ease-in-out",
      isOpen ? "w-52" : "w-0"
    )}>
      {/* Toggle Button */}
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -right-10 top-4 h-8 w-8 bg-card border border-border shadow-sm hover:bg-accent z-10"
      >
        {isOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>

      {/* Content with opacity transition */}
      <div className={cn(
        "flex flex-col h-full transition-opacity duration-300",
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        <div className="px-4 pt-4 pb-1 border-b border-border">
          <h2 className="font-semibold text-foreground mb-1.5">Node Palette</h2>
          
          {/* Filter Icons */}
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setActiveFilter('all')}
              className={cn(
                "h-7 w-7 rounded flex items-center justify-center transition-colors hover:bg-accent/50",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              title="All nodes"
            >
              <LayoutGrid className={cn(
                "h-3.5 w-3.5 transition-colors",
                activeFilter === 'all' ? "text-primary" : "text-muted-foreground"
              )} />
            </button>
            
            <button
              onClick={() => setActiveFilter('transform')}
              className={cn(
                "h-7 w-7 rounded flex items-center justify-center transition-colors hover:bg-accent/50",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              title="Transform nodes"
            >
              <Wand2 className={cn(
                "h-3.5 w-3.5 transition-colors",
                activeFilter === 'transform' ? "text-primary" : "text-muted-foreground"
              )} />
            </button>
            
            <button
              onClick={() => setActiveFilter('design')}
              className={cn(
                "h-7 w-7 rounded flex items-center justify-center transition-colors hover:bg-accent/50",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              title="Design nodes"
            >
              <Palette className={cn(
                "h-3.5 w-3.5 transition-colors",
                activeFilter === 'design' ? "text-primary" : "text-muted-foreground"
              )} />
            </button>
            
            <button
              onClick={() => setActiveFilter('connect')}
              className={cn(
                "h-7 w-7 rounded flex items-center justify-center transition-colors hover:bg-accent/50",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              )}
              title="Connect nodes"
            >
              <Cable className={cn(
                "h-3.5 w-3.5 transition-colors",
                activeFilter === 'connect' ? "text-primary" : "text-muted-foreground"
              )} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pt-1 pb-2 space-y-0.5">
          {(activeFilter === 'all' 
            ? customizedItems 
            : customizedItems.filter(item => item.category === activeFilter)
          ).map((item) => (
            <TooltipProvider key={item.type}>
              <Tooltip delayDuration={300}>
                <TooltipTrigger asChild>
                  <div
                    draggable={!item.disabled}
                    onDragStart={(e) => handleDragStart(e, item.type)}
                    className={cn(
                      "py-2 px-3 rounded-lg border border-border bg-card cursor-grab active:cursor-grabbing transition-colors",
                      item.disabled && "opacity-50 cursor-not-allowed",
                      !item.disabled && "hover:border-primary hover:shadow-sm"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-7 h-7 rounded flex items-center justify-center flex-shrink-0",
                        item.disabled ? "bg-muted" : "bg-primary/10"
                      )}>
                        <item.icon className={cn(
                          "w-3.5 h-3.5",
                          item.disabled ? "text-muted-foreground" : "text-primary"
                        )} />
                      </div>
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <span className="font-medium text-sm text-foreground truncate">
                          {item.title}
                        </span>
                        {item.comingSoon && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-warning/10 text-warning-foreground whitespace-nowrap">
                            Coming Soon
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs">
                  <p className="text-sm">{item.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ))}
        </div>
      </div>
    </div>
  );
}
