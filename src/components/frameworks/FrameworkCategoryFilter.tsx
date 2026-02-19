import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Layers, Bookmark, Wrench, ChevronDown, RefreshCw, Tag } from "lucide-react";

interface FrameworkCategoryFilterProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  selectedWorkflowId: string | null;
  onWorkflowSelect: (workflowId: string | null) => void;
  workflows: Array<{ id: string; name: string }>;
  workflowCounts: Record<string, number>;
  customCategories: Array<{ category: string; count: number }>;
  counts: {
    all: number;
    workflow: number;
    scoring: number;
    general: number;
    lifecycles: number;
  };
}

export const FrameworkCategoryFilter = ({
  activeCategory,
  onCategoryChange,
  selectedWorkflowId,
  onWorkflowSelect,
  workflows,
  workflowCounts,
  customCategories,
  counts
}: FrameworkCategoryFilterProps) => {
  const categories = [
    { id: "all", label: "All", icon: Layers, count: counts.all },
    { id: "scoring", label: "Scoring", icon: Bookmark, count: counts.scoring },
    { id: "general", label: "General", icon: Wrench, count: counts.general },
    { id: "lifecycles", label: "Lifecycles", icon: RefreshCw, count: counts.lifecycles }
  ];

  // Check if current active category is a custom one
  const isCustomCategoryActive = customCategories.some(c => c.category === activeCategory);
  const activeCustomCategory = customCategories.find(c => c.category === activeCategory);

  const isWorkflowActive = activeCategory === "workflow";
  const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId);
  const workflowLabel = selectedWorkflow ? selectedWorkflow.name : "Workflow";
  const workflowCount = selectedWorkflowId 
    ? (workflowCounts[selectedWorkflowId] || 0)
    : counts.workflow;

  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((category) => {
        const Icon = category.icon;
        const isActive = activeCategory === category.id;
        
        return (
          <Button
            key={category.id}
            variant={isActive ? "default" : "outline"}
            size="sm"
            onClick={() => onCategoryChange(category.id)}
            className="gap-2"
          >
            <Icon className="h-4 w-4" />
            {category.label}
            <span className={`ml-1 ${isActive ? "opacity-100" : "opacity-60"}`}>
              ({category.count})
            </span>
          </Button>
        );
      })}
      
      {/* Workflow dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={isWorkflowActive ? "default" : "outline"}
            size="sm"
            className="gap-2"
            onClick={() => {
              if (!isWorkflowActive) {
                onCategoryChange("workflow");
              }
            }}
          >
            <Bookmark className="h-4 w-4" />
            {workflowLabel}
            <span className={`ml-1 ${isWorkflowActive ? "opacity-100" : "opacity-60"}`}>
              ({workflowCount})
            </span>
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 bg-popover z-50">
          <DropdownMenuItem
            onClick={() => {
              onCategoryChange("workflow");
              onWorkflowSelect(null);
            }}
            className="cursor-pointer"
          >
            <span className="flex-1">All Workflows</span>
            <span className="text-muted-foreground">({counts.workflow})</span>
          </DropdownMenuItem>
          
          {workflows.length > 0 && <DropdownMenuSeparator />}
          
          {workflows.length === 0 ? (
            <DropdownMenuItem disabled>
              No workflows available
            </DropdownMenuItem>
          ) : (
            workflows.map((workflow) => (
              <DropdownMenuItem
                key={workflow.id}
                onClick={() => {
                  onCategoryChange("workflow");
                  onWorkflowSelect(workflow.id);
                }}
                className="cursor-pointer"
              >
                <span className="flex-1">{workflow.name}</span>
                <span className="text-muted-foreground">
                  ({workflowCounts[workflow.id] || 0})
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Custom categories dropdown - only show if there are custom categories */}
      {customCategories.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={isCustomCategoryActive ? "default" : "outline"}
              size="sm"
              className="gap-2"
            >
              <Tag className="h-4 w-4" />
              {isCustomCategoryActive && activeCustomCategory 
                ? activeCustomCategory.category 
                : "More"}
              {isCustomCategoryActive && activeCustomCategory && (
                <span className="ml-1 opacity-100">
                  ({activeCustomCategory.count})
                </span>
              )}
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 bg-popover z-50">
            {customCategories.map((cat) => (
              <DropdownMenuItem
                key={cat.category}
                onClick={() => onCategoryChange(cat.category)}
                className="cursor-pointer"
              >
                <span className="flex-1 capitalize">{cat.category}</span>
                <span className="text-muted-foreground">({cat.count})</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
