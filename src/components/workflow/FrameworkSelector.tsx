import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileText, Star, FileCode, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Framework, FrameworkType } from "@/types/framework";

interface FrameworkSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (frameworkId: string, frameworkName: string) => void;
  selectedIds?: string[];
  title?: string;
  description?: string;
}

const typeIcons: Record<FrameworkType | 'lifecycle', typeof FileText> = {
  rating_scale: Star,
  rubric: FileCode,
  criteria: FileCode,
  custom: FileText,
  document: FileText,
  lifecycle: BookOpen,
};

const typeLabels: Record<FrameworkType | 'lifecycle', string> = {
  rating_scale: "Rating Scale",
  rubric: "Rubric",
  criteria: "Criteria",
  custom: "Custom",
  document: "Document",
  lifecycle: "Lifecycle",
};

export function FrameworkSelector({
  open,
  onOpenChange,
  onSelect,
  selectedIds = [],
  title = "Select Framework or Lifecycle",
  description = "Choose a framework or lifecycle to include in your prompt",
}: FrameworkSelectorProps) {
  const [frameworks, setFrameworks] = useState<Framework[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadFrameworks();
    }
  }, [open]);

  const loadFrameworks = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('frameworks')
        .select('id, name, type, category, schema')
        .order('name');
      
      if (error) throw error;
      setFrameworks((data || []) as Framework[]);
    } catch (error) {
      console.error("Failed to load frameworks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get unique categories for filter dropdown
  const getCategories = (): string[] => {
    const categories = new Set<string>();
    frameworks.forEach((fw) => {
      const cat = fw.category === 'lifecycle' ? 'Lifecycle' : (fw.category || 'Uncategorized');
      categories.add(cat);
    });
    return Array.from(categories).sort();
  };

  // Get display category for a framework
  const getDisplayCategory = (framework: Framework): string => {
    if (framework.category === 'lifecycle') return 'Lifecycle';
    return framework.category || 'Uncategorized';
  };

  // Get display type for a framework
  const getDisplayType = (framework: Framework): string => {
    if (framework.category === 'lifecycle') return 'Lifecycle';
    return typeLabels[framework.type] || framework.type;
  };

  const getFilteredFrameworks = (): Framework[] => {
    return frameworks.filter((framework) => {
      // Category filter
      if (categoryFilter !== "all") {
        const displayCat = getDisplayCategory(framework);
        if (displayCat !== categoryFilter) {
          return false;
        }
      }

      // Search filter
      if (
        searchQuery &&
        !framework.name.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  };

  const groupFrameworksByCategory = (fws: Framework[]) => {
    const groups: Record<string, Framework[]> = {};

    fws.forEach((framework) => {
      const category = getDisplayCategory(framework);
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(framework);
    });

    return groups;
  };

  const filteredFrameworks = getFilteredFrameworks();
  const groupedFrameworks = groupFrameworksByCategory(filteredFrameworks);
  const categoryNames = Object.keys(groupedFrameworks).sort((a, b) => {
    // Lifecycle last
    if (a === 'Lifecycle') return 1;
    if (b === 'Lifecycle') return -1;
    return a.localeCompare(b);
  });

  const getCategoryOptions = () => {
    const options = [{ value: "all", label: "All Categories" }];
    getCategories().forEach((cat) => {
      options.push({ value: cat, label: cat });
    });
    return options;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 flex flex-col min-h-0">
          <div>
            <Label htmlFor="category-filter" className="text-sm mb-2 block">
              Category
            </Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id="category-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getCategoryOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Command className="rounded-lg border flex-1 flex flex-col min-h-0">
            <CommandInput
              placeholder="Search frameworks..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading frameworks...
                </div>
              ) : filteredFrameworks.length === 0 ? (
                <CommandEmpty>
                  {searchQuery
                    ? "No frameworks found matching your search."
                    : "No frameworks available."}
                </CommandEmpty>
              ) : (
                categoryNames.map((categoryName) => (
                  <CommandGroup key={categoryName} heading={categoryName}>
                    {groupedFrameworks[categoryName].map((framework) => {
                      const isLifecycle = framework.category === 'lifecycle';
                      const Icon = isLifecycle 
                        ? typeIcons['lifecycle'] 
                        : typeIcons[framework.type] || FileText;
                      const isSelected = selectedIds.includes(framework.id);

                      return (
                        <CommandItem
                          key={framework.id}
                          value={framework.id}
                          onSelect={() => {
                            onSelect(framework.id, framework.name);
                            onOpenChange(false);
                          }}
                          className={isSelected ? "opacity-50" : ""}
                        >
                          <Icon className="mr-2 h-4 w-4 shrink-0" />
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="truncate">{framework.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {getDisplayType(framework)}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              Selected
                            </span>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ))
              )}
            </CommandList>
          </Command>
        </div>
      </DialogContent>
    </Dialog>
  );
}
