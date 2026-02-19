import { useState } from 'react';
import { EntityNodeData } from '@/types/entity';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronDown, Database, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';

interface EntityNodeDataViewerProps {
  nodeData: EntityNodeData[];
  workflows: { id: string; name: string }[];
  loading?: boolean;
}

export function EntityNodeDataViewer({ nodeData, workflows, loading }: EntityNodeDataViewerProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const toggleNodeExpanded = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        Loading node data...
      </div>
    );
  }

  if (nodeData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Database className="h-8 w-8 mb-2" />
        <p>No node data yet</p>
        <p className="text-sm">Run entity workflows to generate outputs</p>
      </div>
    );
  }

  // Group by workflow
  const groupedByWorkflow = nodeData.reduce((acc, node) => {
    if (!acc[node.workflow_id]) {
      acc[node.workflow_id] = [];
    }
    acc[node.workflow_id].push(node);
    return acc;
  }, {} as Record<string, EntityNodeData[]>);

  const getWorkflowName = (workflowId: string) => {
    const workflow = workflows.find((w) => w.id === workflowId);
    return workflow?.name || 'Unknown Workflow';
  };

  return (
    <ScrollArea className="h-[500px]">
      <div className="space-y-4 pr-4">
        {Object.entries(groupedByWorkflow).map(([workflowId, nodes]) => (
          <div key={workflowId} className="border rounded-lg p-4">
            <h4 className="font-medium mb-3 text-sm">{getWorkflowName(workflowId)}</h4>
            <div className="space-y-2">
              {nodes.map((node) => {
                const isExpanded = expandedNodes.has(node.id);
                const hasOutput = node.data?.output;
                
                return (
                  <Collapsible
                    key={node.id}
                    open={isExpanded}
                    onOpenChange={() => toggleNodeExpanded(node.id)}
                  >
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-md hover:bg-muted/50 text-left">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                        <span className="text-sm font-medium">
                          {node.node_label || node.node_id}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {node.node_type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {node.last_executed_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(node.last_executed_at), 'MMM d, HH:mm')}
                          </span>
                        )}
                        <Badge variant={hasOutput ? 'default' : 'secondary'}>
                          v{node.version}
                        </Badge>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 pl-6">
                      {hasOutput ? (
                        <pre className="bg-muted p-3 rounded-md text-xs overflow-auto max-h-[300px]">
                          {typeof node.data?.output === 'string'
                            ? node.data.output
                            : JSON.stringify(node.data?.output, null, 2)}
                        </pre>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          No output data yet
                        </p>
                      )}
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
