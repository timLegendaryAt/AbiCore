import { ChevronRight, ChevronDown, ArrowUp, ArrowDown, ArrowRightToLine, ArrowLeftToLine, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Workflow, WorkflowHierarchyItem } from "@/types/workflow";
import { Button } from "@/components/ui/button";

interface WorkflowMenuItemProps {
  item: WorkflowHierarchyItem;
  currentWorkflowId: string;
  onSelect: (workflow: Workflow) => void;
  onToggleExpand: (workflowId: string) => void;
  onOpenSettings: (workflow: Workflow, e: React.MouseEvent) => void;
  onMoveUp: (workflow: Workflow) => void;
  onMoveDown: (workflow: Workflow) => void;
  onIndent: (workflow: Workflow) => void;
  onOutdent: (workflow: Workflow) => void;
  canMoveUp: (workflow: Workflow) => boolean;
  canMoveDown: (workflow: Workflow) => boolean;
  canIndent: (workflow: Workflow) => boolean;
  canOutdent: (workflow: Workflow) => boolean;
  isOver?: boolean;
}

export const WorkflowMenuItem = ({
  item,
  currentWorkflowId,
  onSelect,
  onToggleExpand,
  onOpenSettings,
  onMoveUp,
  onMoveDown,
  onIndent,
  onOutdent,
  canMoveUp,
  canMoveDown,
  canIndent,
  canOutdent,
  isOver = false,
}: WorkflowMenuItemProps) => {
  const hasChildren = item.children.length > 0;
  const isExpanded = item.workflow.is_expanded !== false;
  const isActive = item.workflow.id === currentWorkflowId;
  const indentLevel = item.level;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 px-2 py-0.5 cursor-pointer rounded-sm transition-colors hover:bg-accent relative",
          isActive && "bg-accent font-semibold",
          isOver && "border-2 border-primary bg-primary/10"
        )}
        style={{ paddingLeft: `${8 + indentLevel * 20}px` }}
      >
        {/* Expand/Collapse Icon */}
        {hasChildren ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 hover:bg-transparent"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(item.workflow.id);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        ) : (
          <div className="h-4 w-4" />
        )}

        {/* Workflow Name */}
        <div
          className="flex-1 truncate text-sm"
          onClick={() => onSelect(item.workflow)}
        >
          {item.workflow.name}
        </div>

        {/* Up Arrow Button */}
        {canMoveUp(item.workflow) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp(item.workflow);
            }}
            title="Move up"
          >
            <ArrowUp className="h-3 w-3" />
          </Button>
        )}

        {/* Down Arrow Button */}
        {canMoveDown(item.workflow) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown(item.workflow);
            }}
            title="Move down"
          >
            <ArrowDown className="h-3 w-3" />
          </Button>
        )}

        {/* Left Arrow (Outdent) Button */}
        {canOutdent(item.workflow) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onOutdent(item.workflow);
            }}
            title="Outdent"
          >
            <ArrowLeftToLine className="h-3 w-3" />
          </Button>
        )}

        {/* Right Arrow (Indent) Button */}
        {canIndent(item.workflow) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onIndent(item.workflow);
            }}
            title="Indent"
          >
            <ArrowRightToLine className="h-3 w-3" />
          </Button>
        )}

        {/* Settings Icon Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
          onClick={(e) => onOpenSettings(item.workflow, e)}
          title="Settings"
        >
          <Settings className="h-3 w-3" />
        </Button>
      </div>

      {/* Render Children */}
      {hasChildren && isExpanded && (
        <div className="animate-accordion-down">
          {item.children.map((child) => (
            <WorkflowMenuItem
              key={child.workflow.id}
              item={child}
              currentWorkflowId={currentWorkflowId}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onOpenSettings={onOpenSettings}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
              onIndent={onIndent}
              onOutdent={onOutdent}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              canIndent={canIndent}
              canOutdent={canOutdent}
            />
          ))}
        </div>
      )}
    </div>
  );
};
