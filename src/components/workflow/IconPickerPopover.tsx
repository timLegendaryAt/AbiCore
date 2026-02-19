import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { iconRegistry, iconOptions } from '@/lib/nodeDefaults';
import { cn } from '@/lib/utils';

interface IconPickerPopoverProps {
  currentIcon: string;
  onSelect: (iconName: string) => void;
  trigger: React.ReactNode;
}

export function IconPickerPopover({ currentIcon, onSelect, trigger }: IconPickerPopoverProps) {
  const [open, setOpen] = useState(false);

  const handleSelect = (iconName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(iconName);
    setOpen(false);
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild onClick={handleTriggerClick}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-2 max-h-64 overflow-y-auto" 
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-6 gap-1">
          {iconOptions.map((opt) => {
            const IconComponent = iconRegistry[opt.name];
            if (!IconComponent) return null;
            
            return (
              <button
                key={opt.name}
                onClick={(e) => handleSelect(opt.name, e)}
                className={cn(
                  "w-10 h-10 rounded flex items-center justify-center transition-colors",
                  currentIcon === opt.name
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
                title={opt.label}
              >
                <IconComponent className="w-5 h-5" />
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
