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
import { 
  MessageSquare, 
  Settings, 
  Database, 
  FileCode, 
  GitBranch, 
  StickyNote,
  FileText,
  User,
  GitFork,
  Plug,
  Minus,
  Square,
  LucideIcon
} from "lucide-react";
import { NodeType, Workflow, NodeBase } from "@/types/workflow";
import { useWorkflowStore } from "@/store/workflowStore";
import { supabase } from "@/integrations/supabase/client";
import { iconRegistry } from "@/lib/nodeDefaults";
import { Integration } from "@/types/integration";

interface DependencySelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentWorkflowId?: string;
  currentNodeId?: string;
  onSelect: (nodeId: string, nodeLabel: string, nodeType: string, workflowId: string, workflowName: string) => void;
  selectedIds?: string[];
  title?: string;
  description?: string;
}

interface NodeOption {
  id: string;
  label: string;
  type: NodeType | 'integration';
  workflowId: string;
  workflowName: string;
  isIntegration?: boolean;
  customIcon?: string;
}

const nodeTypeIcons: Record<NodeType | 'integration', LucideIcon> = {
  promptTemplate: MessageSquare,
  promptPiece: FileText,
  ingest: Database,
  dataset: Database,
  variable: Settings,
  condition: GitFork,
  foreach: GitFork,
  framework: FileCode,
  agent: User,
  note: StickyNote,
  workflow: GitBranch,
  integration: Plug,
  divider: Minus,
  shape: Square,
  floatingEndpoint: Minus, // Minimal icon, shouldn't appear in selector anyway
};

export function DependencySelector({
  open,
  onOpenChange,
  currentWorkflowId,
  currentNodeId,
  onSelect,
  selectedIds = [],
  title = "Select Dependency",
  description = "Choose a node to add as dependency",
}: DependencySelectorProps) {
  const { workflow, loadWorkflows } = useWorkflowStore();
  const [allWorkflows, setAllWorkflows] = useState<Workflow[]>([]);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [workflowFilter, setWorkflowFilter] = useState<string>("current");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadAllWorkflows();
      loadIntegrations();
    }
  }, [open]);

  const loadAllWorkflows = async () => {
    setIsLoading(true);
    try {
      const workflows = await loadWorkflows();
      setAllWorkflows(workflows);
    } catch (error) {
      console.error("Failed to load workflows:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('connected', true)
        .order('name');
      
      if (error) throw error;
      setIntegrations((data || []) as Integration[]);
    } catch (error) {
      console.error("Failed to load integrations:", error);
    }
  };

  const getAllNodeOptions = (): NodeOption[] => {
    const options: NodeOption[] = [];

    // Add current workflow nodes if workflow exists
    if (workflow) {
      workflow.nodes.forEach((node) => {
        // Exclude current node and visual-only nodes (note, divider, shape, floatingEndpoint)
        if (node.id !== currentNodeId && !['note', 'divider', 'shape', 'floatingEndpoint'].includes(node.type)) {
          options.push({
            id: node.id,
            label: node.label,
            type: node.type,
            workflowId: workflow.id,
            workflowName: workflow.name,
            customIcon: node.type === 'promptTemplate' ? node.config?.customIcon : undefined,
          });
        }
      });
    }

    // Add nodes from other workflows
    allWorkflows.forEach((wf) => {
      if (!workflow || wf.id !== workflow.id) {
        wf.nodes.forEach((node) => {
          // Exclude visual-only nodes from dependencies
          if (!['note', 'divider', 'shape', 'floatingEndpoint'].includes(node.type)) {
            options.push({
              id: node.id,
              label: node.label,
              type: node.type,
              workflowId: wf.id,
              workflowName: wf.name,
              customIcon: node.type === 'promptTemplate' ? node.config?.customIcon : undefined,
            });
          }
        });
      }
    });

    // Add integrations
    integrations.forEach((integration) => {
      options.push({
        id: integration.id,
        label: integration.name,
        type: 'integration',
        workflowId: 'integrations',
        workflowName: 'Integrations',
        isIntegration: true,
      });
    });

    return options;
  };

  const getFilteredNodes = (): NodeOption[] => {
    const allNodes = getAllNodeOptions();

    return allNodes.filter((node) => {
      // Filter out integrations - they have their own selector now
      if (node.isIntegration) {
        return false;
      }

      // Workflow filter
      if (workflow && workflowFilter === "current" && node.workflowId !== workflow.id) {
        return false;
      }
      if (
        workflowFilter !== "current" &&
        workflowFilter !== "all" &&
        node.workflowId !== workflowFilter
      ) {
        return false;
      }

      // Search filter
      if (
        searchQuery &&
        !node.label.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false;
      }

      return true;
    });
  };

  const groupNodesByWorkflow = (nodes: NodeOption[]) => {
    const groups: Record<string, NodeOption[]> = {};

    nodes.forEach((node) => {
      if (!groups[node.workflowName]) {
        groups[node.workflowName] = [];
      }
      groups[node.workflowName].push(node);
    });

    return groups;
  };

  const filteredNodes = getFilteredNodes();
  const groupedNodes = groupNodesByWorkflow(filteredNodes);
  const workflowNames = Object.keys(groupedNodes).sort((a, b) => {
    // Current workflow first
    if (workflow && a === workflow.name) return -1;
    if (workflow && b === workflow.name) return 1;
    return a.localeCompare(b);
  });

  const getWorkflowOptions = () => {
    const options = [
      { value: "all", label: "All Workflows" },
    ];

    if (workflow) {
      options.unshift({ value: "current", label: "Current Workflow" });
    }

    allWorkflows.forEach((wf) => {
      if (!workflow || wf.id !== workflow.id) {
        options.push({ value: wf.id, label: wf.name });
      }
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
            <Label htmlFor="workflow-filter" className="text-sm mb-2 block">
              Workflow
            </Label>
            <Select value={workflowFilter} onValueChange={setWorkflowFilter}>
              <SelectTrigger id="workflow-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getWorkflowOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Command className="rounded-lg border flex-1 flex flex-col min-h-0">
            <CommandInput
              placeholder="Search nodes..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList className="flex-1 overflow-y-auto">
              {isLoading ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Loading workflows...
                </div>
              ) : filteredNodes.length === 0 ? (
                <CommandEmpty>
                  {searchQuery
                    ? "No nodes found matching your search."
                    : "No nodes available in selected workflow."}
                </CommandEmpty>
              ) : (
                workflowNames.map((workflowName) => (
                  <CommandGroup key={workflowName} heading={workflowName}>
                    {groupedNodes[workflowName].map((node) => {
                      // Use custom icon for promptTemplate nodes if available
                      const Icon = node.customIcon && iconRegistry[node.customIcon] 
                        ? iconRegistry[node.customIcon] 
                        : nodeTypeIcons[node.type];
                      const isSelected = selectedIds.includes(node.id);

                      return (
                        <CommandItem
                          key={node.id}
                          value={node.id}
                          onSelect={() => {
                            onSelect(node.id, node.label, node.type, node.workflowId, node.workflowName);
                            onOpenChange(false);
                          }}
                          className={isSelected ? "opacity-50" : ""}
                        >
                          <Icon className="mr-2 h-4 w-4 shrink-0" />
                          <div className="flex flex-col flex-1 min-w-0">
                            <span className="truncate">{node.label}</span>
                            <span className="text-xs text-muted-foreground capitalize">
                              {node.type.replace(/([A-Z])/g, " $1").trim()}
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
