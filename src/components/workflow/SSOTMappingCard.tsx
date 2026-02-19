import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Trash2, Plus, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { SSOTMapDependency } from '@/types/workflow';
import { extractJsonPaths, suggestTargetField, formatValuePreview, formatPathAsDisplayName, ExtractedPath } from '@/lib/jsonPathUtils';
import { supabase } from '@/integrations/supabase/client';

interface FieldMapping {
  id: string;
  jsonPath: string;
  targetDomain: string;
  targetFieldKey: string;
  targetFieldName?: string;
}

interface SSOTMappingCardProps {
  nodeId: string;
  nodeLabel: string;
  workflowId: string;
  workflowName: string;
  mappings: FieldMapping[];
  domains: Array<{ domain: string; display_name: string }>;
  fieldDefinitions: Array<{ domain: string; field_key: string; display_name: string; level: string; field_type: string }>;
  selectedCompanyId: string | null;
  onUpdateMappings: (mappings: FieldMapping[]) => void;
  onRemoveNode: () => void;
  getValueForPath: (nodeId: string, jsonPath: string) => { value: any; isLoading: boolean } | undefined;
}

export function SSOTMappingCard({
  nodeId,
  nodeLabel,
  workflowId,
  workflowName,
  mappings,
  domains,
  fieldDefinitions,
  selectedCompanyId,
  onUpdateMappings,
  onRemoveNode,
  getValueForPath,
}: SSOTMappingCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [detectedPaths, setDetectedPaths] = useState<ExtractedPath[]>([]);
  const [isLoadingPaths, setIsLoadingPaths] = useState(false);

  // Load and detect JSON paths from cached output
  useEffect(() => {
    const loadCachedOutput = async () => {
      if (!selectedCompanyId) {
        setDetectedPaths([]);
        return;
      }

      setIsLoadingPaths(true);
      try {
        const { data } = await supabase
          .from('company_node_data')
          .select('data')
          .eq('node_id', nodeId)
          .eq('company_id', selectedCompanyId)
          .eq('workflow_id', workflowId)
          .maybeSingle();

        if (data?.data) {
          const paths = extractJsonPaths(data.data);
          // Filter to only primitive types
          const mappablePaths = paths.filter(p =>
            ['string', 'number', 'boolean', 'array', 'null'].includes(p.type)
          );
          setDetectedPaths(mappablePaths);
        } else {
          setDetectedPaths([]);
        }
      } catch (error) {
        console.error('Failed to load cached output:', error);
        setDetectedPaths([]);
      } finally {
        setIsLoadingPaths(false);
      }
    };

    loadCachedOutput();
  }, [nodeId, selectedCompanyId]);

  const handleAddMapping = () => {
    // Auto-suggest first available path
    const usedPaths = mappings.map(m => m.jsonPath);
    const usedFieldKeys = mappings.map(m => m.targetFieldKey).filter(Boolean);
    const availablePath = detectedPaths.find(p => !usedPaths.includes(p.path));
    
    const newMapping: FieldMapping = {
      id: crypto.randomUUID(),
      jsonPath: availablePath?.path || '',
      targetDomain: '',
      targetFieldKey: '',
    };

    // Try to auto-suggest domain/field if path exists
    if (availablePath) {
      const suggestion = suggestTargetField(
        availablePath.path, 
        domains, 
        fieldDefinitions,
        usedFieldKeys
      );
      if (suggestion.domain) {
        newMapping.targetDomain = suggestion.domain;
      }
      if (suggestion.fieldKey) {
        newMapping.targetFieldKey = suggestion.fieldKey;
        const field = fieldDefinitions.find(f => f.field_key === suggestion.fieldKey);
        newMapping.targetFieldName = field?.display_name;
      }
    }

    onUpdateMappings([...mappings, newMapping]);
  };

  const handleUpdateMapping = (mappingId: string, updates: Partial<FieldMapping>) => {
    const updated = mappings.map(m => {
      if (m.id === mappingId) {
        // If domain changed, reset field
        if (updates.targetDomain && updates.targetDomain !== m.targetDomain) {
          return { ...m, ...updates, targetFieldKey: '', targetFieldName: '' };
        }
        
        // If jsonPath changed, auto-suggest new target
        if (updates.jsonPath && updates.jsonPath !== m.jsonPath) {
          const usedFieldKeys = mappings
            .filter(other => other.id !== mappingId)
            .map(other => other.targetFieldKey)
            .filter(Boolean);
          
          const suggestion = suggestTargetField(
            updates.jsonPath,
            domains,
            fieldDefinitions,
            usedFieldKeys
          );
          
          const targetDomain = suggestion.domain || '';
          const targetFieldKey = suggestion.fieldKey || '';
          const targetField = fieldDefinitions.find(f => f.field_key === targetFieldKey);
          
          return {
            ...m,
            ...updates,
            targetDomain,
            targetFieldKey,
            targetFieldName: targetField?.display_name || '',
          };
        }
        
        return { ...m, ...updates };
      }
      return m;
    });
    onUpdateMappings(updated);
  };

  const handleDeleteMapping = (mappingId: string) => {
    onUpdateMappings(mappings.filter(m => m.id !== mappingId));
  };

  const getFieldsForDomain = (domain: string) => {
    return fieldDefinitions.filter(f => f.domain === domain);
  };

  return (
    <div className="bg-muted/50 rounded-lg border border-border overflow-hidden">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center gap-2 p-3 bg-muted/30">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <span className="font-medium text-sm flex-1 truncate">{nodeLabel}</span>
          {workflowName && workflowId !== 'current' && (
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {workflowName}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {mappings.length} mapping{mappings.length !== 1 ? 's' : ''}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onRemoveNode}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>

        <CollapsibleContent>
          <div className="p-3 pt-0 space-y-2">
            {/* Loading state */}
            {isLoadingPaths && (
              <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading output fields...
              </div>
            )}

            {/* Mapping rows */}
            {mappings.map((mapping) => {
              // Filter out paths already used by other mappings
              const usedPaths = mappings.filter(m => m.id !== mapping.id).map(m => m.jsonPath);
              const availablePaths = detectedPaths.filter(p => !usedPaths.includes(p.path) || p.path === mapping.jsonPath);
              
              // Filter out fields already used by other mappings in the same domain
              const usedFieldsInDomain = mappings
                .filter(m => m.id !== mapping.id && m.targetDomain === mapping.targetDomain)
                .map(m => m.targetFieldKey);
              const availableFields = getFieldsForDomain(mapping.targetDomain)
                .filter(f => !usedFieldsInDomain.includes(f.field_key) || f.field_key === mapping.targetFieldKey);
              
              const valueData = getValueForPath(nodeId, mapping.jsonPath);

              return (
                <div
                  key={mapping.id}
                  className="space-y-1.5 p-2 bg-background rounded border"
                >
                  {/* From: JSON Path - full width */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-10 flex-shrink-0">From</span>
                    <Select
                      value={mapping.jsonPath}
                      onValueChange={(v) => handleUpdateMapping(mapping.id, { jsonPath: v })}
                    >
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder={isLoadingPaths ? "Loading..." : "Select path..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePaths.length > 0 ? (
                          availablePaths.map((p) => (
                            <SelectItem key={p.path} value={p.path}>
                              <span className="flex items-center gap-2">
                                <span className="text-xs">{formatPathAsDisplayName(p.path)}</span>
                                <span className="text-muted-foreground text-xs">
                                  {formatValuePreview(p.value, 15)}
                                </span>
                              </span>
                            </SelectItem>
                          ))
                        ) : (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            {isLoadingPaths ? "Loading paths..." : "No available paths"}
                          </div>
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={() => handleDeleteMapping(mapping.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* To: Domain + Field - full width */}
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-xs text-muted-foreground flex-shrink-0">→</span>
                    <Select
                      value={mapping.targetDomain}
                      onValueChange={(v) => handleUpdateMapping(mapping.id, { targetDomain: v })}
                    >
                      <SelectTrigger className="h-7 text-xs w-28 flex-shrink-0">
                        <SelectValue placeholder="Domain" />
                      </SelectTrigger>
                      <SelectContent>
                        {domains.map((d) => (
                          <SelectItem key={d.domain} value={d.domain}>
                            {d.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={mapping.targetFieldKey}
                      onValueChange={(v) => {
                        const field = availableFields.find(f => f.field_key === v);
                        handleUpdateMapping(mapping.id, {
                          targetFieldKey: v,
                          targetFieldName: field?.display_name || v,
                        });
                      }}
                      disabled={!mapping.targetDomain}
                    >
                      <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
                        <SelectValue placeholder="Field" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFields.map((f) => (
                          <SelectItem key={f.field_key} value={f.field_key}>
                            <span className="flex items-center gap-1 truncate">
                              <span className="text-muted-foreground flex-shrink-0">{f.level}</span>
                              <span className="truncate">{f.display_name}</span>
                              {f.field_type === 'array' && (
                                <span className="text-xs bg-primary/10 text-primary px-1 rounded">[]</span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}

            {/* Add mapping button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddMapping}
              className="w-full h-8 text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Field Mapping
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
