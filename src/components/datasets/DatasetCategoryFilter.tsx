import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

interface DatasetCategoryFilterProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  selectedWorkflowId: string | null;
  onWorkflowSelect: (workflowId: string | null) => void;
  workflows: Array<{ id: string; name: string }>;
  workflowCounts: Record<string, number>;
  counts: {
    all: number;
    workflow: number;
    general: number;
  };
}

export const DatasetCategoryFilter = ({
  activeCategory,
  onCategoryChange,
  selectedWorkflowId,
  onWorkflowSelect,
  workflows,
  workflowCounts,
  counts,
}: DatasetCategoryFilterProps) => {
  const [isWorkflowDropdownOpen, setIsWorkflowDropdownOpen] = useState(false);

  const handleWorkflowSelect = (workflowId: string) => {
    onWorkflowSelect(workflowId);
    onCategoryChange("workflow");
    setIsWorkflowDropdownOpen(false);
  };

  const getWorkflowButtonLabel = () => {
    if (selectedWorkflowId) {
      const workflow = workflows.find((w) => w.id === selectedWorkflowId);
      return workflow?.name || "Workflow";
    }
    return "Workflow";
  };

  return (
    <div className="flex gap-2">
      <Button
        variant={activeCategory === "all" ? "default" : "outline"}
        onClick={() => onCategoryChange("all")}
        className="min-w-[80px]"
      >
        All ({counts.all})
      </Button>

      <Button
        variant={activeCategory === "general" ? "default" : "outline"}
        onClick={() => onCategoryChange("general")}
        className="min-w-[80px]"
      >
        General ({counts.general})
      </Button>

      <DropdownMenu
        open={isWorkflowDropdownOpen}
        onOpenChange={setIsWorkflowDropdownOpen}
      >
        <DropdownMenuTrigger asChild>
          <Button
            variant={activeCategory === "workflow" ? "default" : "outline"}
            className="min-w-[120px] justify-between"
          >
            <span>
              {getWorkflowButtonLabel()}
              {activeCategory === "workflow" &&
                selectedWorkflowId &&
                ` (${workflowCounts[selectedWorkflowId] || 0})`}
              {activeCategory === "workflow" &&
                !selectedWorkflowId &&
                ` (${counts.workflow})`}
            </span>
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[200px]">
          <DropdownMenuItem
            onClick={() => {
              onCategoryChange("workflow");
              onWorkflowSelect(null);
              setIsWorkflowDropdownOpen(false);
            }}
          >
            All Workflows ({counts.workflow})
          </DropdownMenuItem>
          {workflows.map((workflow) => (
            <DropdownMenuItem
              key={workflow.id}
              onClick={() => handleWorkflowSelect(workflow.id)}
            >
              {workflow.name} ({workflowCounts[workflow.id] || 0})
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
