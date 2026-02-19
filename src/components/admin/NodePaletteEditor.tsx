import { useState } from 'react';
import { 
  defaultPaletteItems, 
  iconRegistry, 
  iconOptions, 
  defaultIconNames,
  NodeCustomization,
  NodeCustomizations
} from '@/lib/nodeDefaults';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NodePaletteEditorProps {
  customizations: NodeCustomizations;
  onChange: (customizations: NodeCustomizations) => void;
  onSave: (customizations: NodeCustomizations) => Promise<void>;
}

const categories = [
  { id: 'transform' as const, label: 'Transform' },
  { id: 'design' as const, label: 'Design' },
  { id: 'connect' as const, label: 'Connect' },
];

export function NodePaletteEditor({ customizations, onChange, onSave }: NodePaletteEditorProps) {
  const [localCustomizations, setLocalCustomizations] = useState<NodeCustomizations>(customizations);

  // For toggles, icons, and categories - save immediately
  const updateAndSave = async (type: string, updates: Partial<NodeCustomization>) => {
    const current = localCustomizations[type] || {};
    const updated = {
      ...localCustomizations,
      [type]: { ...current, ...updates },
    };
    setLocalCustomizations(updated);
    onChange(updated);
    await onSave(updated);
  };

  // For text inputs - only update local state on change
  const updateText = (type: string, updates: Partial<NodeCustomization>) => {
    const current = localCustomizations[type] || {};
    const updated = {
      ...localCustomizations,
      [type]: { ...current, ...updates },
    };
    setLocalCustomizations(updated);
    onChange(updated);
  };

  // Save current state when text input loses focus
  const handleTextBlur = async () => {
    await onSave(localCustomizations);
  };

  const getEffectiveValue = <K extends keyof NodeCustomization>(
    type: string, 
    key: K, 
    defaultValue: NodeCustomization[K]
  ): NonNullable<NodeCustomization[K]> => {
    const custom = localCustomizations[type];
    if (custom && custom[key] !== undefined) {
      return custom[key] as NonNullable<NodeCustomization[K]>;
    }
    return defaultValue as NonNullable<NodeCustomization[K]>;
  };

  const resetNode = async (type: string) => {
    const updated = { ...localCustomizations };
    delete updated[type];
    setLocalCustomizations(updated);
    onChange(updated);
    await onSave(updated);
  };

  const resetAll = async () => {
    setLocalCustomizations({});
    onChange({});
    await onSave({});
  };

  const isCustomized = (type: string): boolean => {
    const custom = localCustomizations[type];
    if (!custom) return false;
    return Object.keys(custom).length > 0;
  };

  // Group items by their effective category
  const getItemsByCategory = (categoryId: 'transform' | 'design' | 'connect') => {
    return defaultPaletteItems.filter(item => {
      const effectiveCategory = getEffectiveValue(item.type, 'category', item.category);
      return effectiveCategory === categoryId;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Customize visibility, labels, icons, and categories for workflow nodes
        </p>
        <Button variant="outline" size="sm" onClick={resetAll}>
          <RotateCcw className="w-4 h-4 mr-2" />
          Reset All
        </Button>
      </div>

      <Accordion type="multiple" defaultValue={['transform', 'design', 'connect']} className="w-full">
        {categories.map((category) => {
          const categoryItems = getItemsByCategory(category.id);

          return (
            <AccordionItem key={category.id} value={category.id}>
              <AccordionTrigger className="text-sm font-semibold">
                {category.label} Nodes ({categoryItems.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 pt-2">
                  {categoryItems.map((item) => {
                    const isEnabled = getEffectiveValue(item.type, 'enabled', true);
                    const currentTitle = getEffectiveValue(item.type, 'title', item.title);
                    const currentDescription = getEffectiveValue(item.type, 'description', item.description);
                    const currentIcon = getEffectiveValue(item.type, 'icon', defaultIconNames[item.type]);
                    const currentCategory = getEffectiveValue(item.type, 'category', item.category);
                    const customized = isCustomized(item.type);

                    const IconComponent = iconRegistry[currentIcon] || item.icon;

                    return (
                      <Card key={item.type} className={cn(
                        "group relative transition-opacity",
                        customized && "border-primary/50",
                        !isEnabled && "opacity-50"
                      )}>
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            {/* Enable Toggle - save immediately */}
                            <div className="pt-1">
                              <Switch
                                checked={isEnabled}
                                onCheckedChange={(checked) => updateAndSave(item.type, { enabled: checked })}
                              />
                            </div>

                            {/* Icon Selector - save immediately */}
                            <Select
                              value={currentIcon}
                              onValueChange={(value) => updateAndSave(item.type, { icon: value })}
                            >
                              <SelectTrigger className="w-14 h-10 p-0 justify-center">
                                <IconComponent className="w-5 h-5 text-primary" />
                              </SelectTrigger>
                              <SelectContent className="max-h-64">
                                {iconOptions.map((opt) => {
                                  const OptIcon = iconRegistry[opt.name];
                                  return (
                                    <SelectItem key={opt.name} value={opt.name}>
                                      <div className="flex items-center gap-2">
                                        <OptIcon className="w-4 h-4" />
                                        <span>{opt.label}</span>
                                      </div>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>

                            {/* Title & Description - save on blur */}
                            <div className="flex-1 space-y-1.5 min-w-0">
                              <Input
                                value={currentTitle}
                                onChange={(e) => updateText(item.type, { title: e.target.value.slice(0, 30) })}
                                onBlur={handleTextBlur}
                                placeholder={item.title}
                                maxLength={30}
                                className="h-8 text-sm font-medium"
                              />
                              <Input
                                value={currentDescription}
                                onChange={(e) => updateText(item.type, { description: e.target.value.slice(0, 100) })}
                                onBlur={handleTextBlur}
                                placeholder={item.description}
                                maxLength={100}
                                className="h-8 text-sm text-muted-foreground"
                              />
                            </div>

                            {/* Category Selector - save immediately */}
                            <Select
                              value={currentCategory}
                              onValueChange={(value) => updateAndSave(item.type, { category: value as 'transform' | 'design' | 'connect' })}
                            >
                              <SelectTrigger className="w-28 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="transform">Transform</SelectItem>
                                <SelectItem value="design">Design</SelectItem>
                                <SelectItem value="connect">Connect</SelectItem>
                              </SelectContent>
                            </Select>

                            {/* Reset Button - save immediately */}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => resetNode(item.type)}
                              className={cn(
                                "h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity",
                                !customized && "invisible"
                              )}
                              title="Reset to default"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
