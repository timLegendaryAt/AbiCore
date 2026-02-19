import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Layers, AlertCircle, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkflowStore } from '@/store/workflowStore';
import { extractJsonPaths, suggestTargetField, formatValuePreview, ExtractedPath } from '@/lib/jsonPathUtils';
import { SSOTMapDependency } from '@/types/workflow';

interface BulkMappingRow extends ExtractedPath {
  selected: boolean;
  targetDomain: string;
  targetFieldKey: string;
}

interface DomainDefinition {
  domain: string;
  display_name: string;
}

interface FieldDefinition {
  domain: string;
  field_key: string;
  display_name: string;
  level: string;
}

interface WorkflowOption {
  id: string;
  name: string;
}

interface NodeOption {
  id: string;
  label: string;
  type: string;
  workflowId: string;
  workflowName: string;
}

interface BulkSSOTMappingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentWorkflowId: string;
  currentNodeId: string;
  existingMappings: SSOTMapDependency[];
  onAddMappings: (mappings: Array<{
    nodeId: string;
    nodeLabel: string;
    workflowId: string;
    workflowName: string;
    jsonPath: string;
    targetDomain: string;
    targetFieldKey: string;
    targetFieldName: string;
  }>) => void;
}

export function BulkSSOTMappingDialog({
  open,
  onOpenChange,
  currentWorkflowId,
  currentNodeId,
  existingMappings,
  onAddMappings,
}: BulkSSOTMappingDialogProps) {
  const { workflow, selectedCompanyId } = useWorkflowStore();
  
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('current');
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [cachedOutput, setCachedOutput] = useState<any>(null);
  const [mappingRows, setMappingRows] = useState<BulkMappingRow[]>([]);
  
  const [workflows, setWorkflows] = useState<WorkflowOption[]>([]);
  const [domains, setDomains] = useState<DomainDefinition[]>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);

  // Fetch workflows and SSOT schema on mount
  useEffect(() => {
    const fetchData = async () => {
      // Fetch workflows
      const { data: workflowsData } = await supabase
        .from('workflows')
        .select('id, name')
        .order('name');
      
      if (workflowsData) {
        setWorkflows(workflowsData);
      }

      // Fetch SSOT domains
      const { data: domainsData } = await supabase
        .from('company_domain_definitions')
        .select('domain, display_name')
        .order('sort_order');
      
      if (domainsData) {
        setDomains(domainsData);
      }

      // Fetch field definitions
      const { data: fieldsData } = await supabase
        .from('company_field_definitions')
        .select('domain, field_key, display_name, level')
        .order('sort_order');
      
      if (fieldsData) {
        setFieldDefinitions(fieldsData);
      }
    };

    if (open) {
      fetchData();
    }
  }, [open]);

  // Get available nodes from selected workflow
  const availableNodes = useMemo((): NodeOption[] => {
    const nodes: NodeOption[] = [];
    
    // Add nodes from current workflow (excluding the current node)
    // Use type assertion since workflow nodes have data property
    workflow.nodes
      .filter(n => 
        n.id !== currentNodeId && 
        !['divider', 'note', 'shape', 'floatingEndpoint'].includes(n.type)
      )
      .forEach(n => {
        // Cast to any to access data property which exists on workflow nodes
        const nodeWithData = n as any;
        nodes.push({
          id: n.id,
          label: nodeWithData.data?.label || n.type,
          type: n.type,
          workflowId: currentWorkflowId,
          workflowName: workflow.name,
        });
      });
    
    return nodes;
  }, [workflow.nodes, currentNodeId, currentWorkflowId, workflow.name]);

  // Load cached output when node is selected
  useEffect(() => {
    const loadCachedOutput = async () => {
      if (!selectedNodeId || !selectedCompanyId) {
        setCachedOutput(null);
        setMappingRows([]);
        return;
      }

      setIsLoadingData(true);

      try {
        // Get workflow ID from selected node (may be from current workflow or dependency)
        const selectedNode = availableNodes.find(n => n.id === selectedNodeId);
        const targetWorkflowId = selectedNode?.workflowId || currentWorkflowId;

        const { data } = await supabase
          .from('company_node_data')
          .select('data')
          .eq('node_id', selectedNodeId)
          .eq('company_id', selectedCompanyId)
          .eq('workflow_id', targetWorkflowId)
          .maybeSingle();

        if (data?.data) {
          setCachedOutput(data.data);
          
          // Extract paths and create mapping rows
          const paths = extractJsonPaths(data.data);
          
          // Filter out object/array types for cleaner mapping, but keep primitives
          const mappablePaths = paths.filter(p => 
            ['string', 'number', 'boolean'].includes(p.type)
          );

          // Create mapping rows with auto-suggestions
          const rows: BulkMappingRow[] = mappablePaths.map(p => {
            const suggestion = suggestTargetField(p.path, domains, fieldDefinitions);
            const hasMatch = !!(suggestion.domain && suggestion.fieldKey);
            
            // Check if this path is already mapped
            const isAlreadyMapped = existingMappings.some(
              m => m.nodeId === selectedNodeId && m.jsonPath === p.path
            );
            
            return {
              ...p,
              selected: hasMatch && !isAlreadyMapped,
              targetDomain: suggestion.domain || '',
              targetFieldKey: suggestion.fieldKey || '',
            };
          });

          setMappingRows(rows);
        } else {
          setCachedOutput(null);
          setMappingRows([]);
        }
      } catch (error) {
        console.error('Failed to load cached output:', error);
        setCachedOutput(null);
        setMappingRows([]);
      } finally {
        setIsLoadingData(false);
      }
    };

    loadCachedOutput();
  }, [selectedNodeId, selectedCompanyId, domains, fieldDefinitions, existingMappings]);

  // Toggle selection of a mapping row
  const handleToggle = (path: string) => {
    setMappingRows(rows =>
      rows.map(r => r.path === path ? { ...r, selected: !r.selected } : r)
    );
  };

  // Update target domain/field for a row
  const handleUpdateRow = (path: string, updates: Partial<BulkMappingRow>) => {
    setMappingRows(rows =>
      rows.map(r => {
        if (r.path === path) {
          // If domain changed, reset field
          if (updates.targetDomain && updates.targetDomain !== r.targetDomain) {
            return { ...r, ...updates, targetFieldKey: '' };
          }
          return { ...r, ...updates };
        }
        return r;
      })
    );
  };

  // Select/Deselect all
  const handleSelectAll = () => {
    setMappingRows(rows => rows.map(r => ({ ...r, selected: true })));
  };

  const handleDeselectAll = () => {
    setMappingRows(rows => rows.map(r => ({ ...r, selected: false })));
  };

  // Get selected node info
  const selectedNodeInfo = availableNodes.find(n => n.id === selectedNodeId);

  // Count valid selections (have both domain and field)
  const validSelections = mappingRows.filter(
    r => r.selected && r.targetDomain && r.targetFieldKey
  );

  // Handle adding mappings
  const handleAddMappings = () => {
    if (!selectedNodeInfo) return;

    const mappings = validSelections.map(row => {
      const field = fieldDefinitions.find(
        f => f.domain === row.targetDomain && f.field_key === row.targetFieldKey
      );
      
      return {
        nodeId: selectedNodeInfo.id,
        nodeLabel: selectedNodeInfo.label,
        workflowId: selectedNodeInfo.workflowId,
        workflowName: selectedNodeInfo.workflowName,
        jsonPath: row.path,
        targetDomain: row.targetDomain,
        targetFieldKey: row.targetFieldKey,
        targetFieldName: field?.display_name || row.targetFieldKey,
      };
    });

    onAddMappings(mappings);
    onOpenChange(false);
    
    // Reset state
    setSelectedNodeId('');
    setCachedOutput(null);
    setMappingRows([]);
  };

  // Get available fields for a domain
  const getFieldsForDomain = (domain: string) => {
    return fieldDefinitions.filter(f => f.domain === domain);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5" />
            Bulk Map Fields to SSOT
          </DialogTitle>
          <DialogDescription>
            Select a dependency node and map multiple fields to Master Data at once
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Node Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Source Node</label>
            <Select value={selectedNodeId} onValueChange={setSelectedNodeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a node to map from..." />
              </SelectTrigger>
              <SelectContent>
                {availableNodes.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    No nodes available
                  </div>
                ) : (
                  availableNodes.map(node => (
                    <SelectItem key={node.id} value={node.id}>
                      <span className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          [{node.type}]
                        </span>
                        {node.label}
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Loading State */}
          {isLoadingData && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading cached output...
              </span>
            </div>
          )}

          {/* No Data State */}
          {!isLoadingData && selectedNodeId && !cachedOutput && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No cached data found for this node.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Run the node first to generate output data.
              </p>
            </div>
          )}

          {/* Mapping Rows */}
          {!isLoadingData && mappingRows.length > 0 && (
            <>
              <div className="flex items-center justify-between text-sm">
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAll}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeselectAll}
                  >
                    Deselect All
                  </Button>
                </div>
                <span className="text-muted-foreground">
                  {validSelections.length} of {mappingRows.length} ready to map
                </span>
              </div>

              <ScrollArea className="flex-1 border rounded-md">
                <div className="p-2 space-y-1">
                  {mappingRows.map(row => {
                    const availableFields = getFieldsForDomain(row.targetDomain);
                    const isAlreadyMapped = existingMappings.some(
                      m => m.nodeId === selectedNodeId && m.jsonPath === row.path
                    );

                    return (
                      <div
                        key={row.path}
                        className={`flex items-center gap-2 p-2 rounded-md transition-colors ${
                          row.selected ? 'bg-muted/50' : 'hover:bg-muted/30'
                        } ${isAlreadyMapped ? 'opacity-50' : ''}`}
                      >
                        <Checkbox
                          checked={row.selected}
                          onCheckedChange={() => handleToggle(row.path)}
                          disabled={isAlreadyMapped}
                        />
                        
                        {/* Path and Value */}
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-[140px]">
                            {row.path}
                          </code>
                          <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                            {formatValuePreview(row.value, 25)}
                          </span>
                        </div>

                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />

                        {/* Domain Selector */}
                        <Select
                          value={row.targetDomain}
                          onValueChange={(v) => handleUpdateRow(row.path, { targetDomain: v })}
                          disabled={isAlreadyMapped}
                        >
                          <SelectTrigger className="w-[120px] h-8">
                            <SelectValue placeholder="Domain" />
                          </SelectTrigger>
                          <SelectContent>
                            {domains.map(d => (
                              <SelectItem key={d.domain} value={d.domain}>
                                {d.display_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Field Selector */}
                        <Select
                          value={row.targetFieldKey}
                          onValueChange={(v) => handleUpdateRow(row.path, { targetFieldKey: v })}
                          disabled={!row.targetDomain || isAlreadyMapped}
                        >
                          <SelectTrigger className="w-[140px] h-8">
                            <SelectValue placeholder="Field" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableFields.map(f => (
                              <SelectItem key={f.field_key} value={f.field_key}>
                                <span className="flex items-center gap-1">
                                  <span className="text-xs text-muted-foreground">
                                    {f.level}
                                  </span>
                                  {f.display_name}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {isAlreadyMapped && (
                          <span className="text-xs text-muted-foreground">
                            (mapped)
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          )}

          {/* No mappable fields */}
          {!isLoadingData && selectedNodeId && cachedOutput && mappingRows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="w-8 h-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No mappable fields found in the output.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Only primitive values (strings, numbers, booleans) can be mapped.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleAddMappings}
            disabled={validSelections.length === 0}
          >
            Add {validSelections.length} Mapping{validSelections.length !== 1 ? 's' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
