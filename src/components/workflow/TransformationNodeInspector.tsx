import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useWorkflowStore } from '@/store/workflowStore';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DependencySelector } from '@/components/workflow/DependencySelector';
import { SSOTMappingCard } from '@/components/workflow/SSOTMappingCard';
import { ScoreDependency, ScoreStageConfig, SSOTMapDependency } from '@/types/workflow';
import { Plus, GripVertical, Trash2, Calculator, Settings, Loader2, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Helper to extract a value from an object using a JSON path (e.g., "score" or "data.score")
// Also handles string outputs that contain JSON (possibly wrapped in markdown code blocks)
const getValueByPath = (obj: any, path: string): any => {
  if (!obj || !path) return undefined;
  
  let current = obj;
  
  // If the value is a string, try to parse it as JSON
  // This handles AI outputs that return JSON wrapped in markdown code blocks
  if (typeof current === 'string') {
    try {
      // Strip markdown code block wrappers if present
      let jsonStr = current.trim();
      const codeBlockMatch = jsonStr.match(/^```(?:json)?\s*([\s\S]*?)```$/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      }
      current = JSON.parse(jsonStr);
    } catch {
      // If parsing fails, return undefined
      return undefined;
    }
  }
  
  // Navigate the path
  const parts = path.split('.');
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
};

interface TransformationNodeInspectorProps {
  nodeId: string;
}

const DEFAULT_STAGES: ScoreStageConfig[] = [
  { stage: 'ideation', label: 'Ideation', totalPossible: 100 },
  { stage: 'pre_seed', label: 'Pre-seed', totalPossible: 100 },
  { stage: 'early_stage', label: 'Early Stage', totalPossible: 100 },
  { stage: 'scaling_stage', label: 'Scaling Stage', totalPossible: 100 },
  { stage: 'mature_startup', label: 'Mature Startup', totalPossible: 100 },
];

const JSON_PATH_PRESETS = [
  { value: 'score', label: 'score' },
  { value: 'rating', label: 'rating' },
  { value: 'value', label: 'value' },
  { value: 'result', label: 'result' },
  { value: 'custom', label: 'Custom...' },
];

interface SortableScoreItemProps {
  dep: ScoreDependency;
  stages: ScoreStageConfig[];
  onUpdate: (id: string, updates: Partial<ScoreDependency>) => void;
  onDelete: (id: string) => void;
  dependencyValue: { value: any; isLoading: boolean } | undefined;
}

function SortableScoreItem({ dep, stages, onUpdate, onDelete, dependencyValue }: SortableScoreItemProps) {
  const [isCustomPath, setIsCustomPath] = useState(!JSON_PATH_PRESETS.some(p => p.value === dep.jsonPath && p.value !== 'custom'));
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dep.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handlePathChange = (value: string) => {
    if (value === 'custom') {
      setIsCustomPath(true);
      onUpdate(dep.id, { jsonPath: '' });
    } else {
      setIsCustomPath(false);
      onUpdate(dep.id, { jsonPath: value });
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="p-3 bg-muted/50 rounded-lg border border-border space-y-2"
    >
      <div className="flex items-center gap-2">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab hover:bg-muted rounded p-1"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="font-medium text-sm flex-1 truncate">{dep.nodeLabel}</span>
        {dep.workflowName && dep.workflowId !== 'current' && (
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {dep.workflowName}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onDelete(dep.id)}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-xs text-muted-foreground">JSON Path</span>
          {isCustomPath ? (
            <Input
              value={dep.jsonPath}
              onChange={(e) => onUpdate(dep.id, { jsonPath: e.target.value })}
              placeholder="e.g., data.score"
              className="h-8 text-sm"
            />
          ) : (
            <Select value={dep.jsonPath || 'score'} onValueChange={handlePathChange}>
              <SelectTrigger className="h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {JSON_PATH_PRESETS.map((preset) => (
                  <SelectItem key={preset.value} value={preset.value}>
                    {preset.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        
        {dep.jsonPath && (
          <div>
            <span className="text-xs text-muted-foreground">Value</span>
            <div className="h-8 px-3 flex items-center bg-muted rounded-md border border-border text-sm">
              {dependencyValue?.isLoading ? (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              ) : dependencyValue?.value !== undefined ? (
                <span className="text-foreground font-medium">
                  {typeof dependencyValue.value === 'number' 
                    ? dependencyValue.value 
                    : JSON.stringify(dependencyValue.value)}
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// SSOT Mapping - Grouped by node with multiple field mappings
interface SSOTNodeMapping {
  nodeId: string;
  nodeLabel: string;
  workflowId: string;
  workflowName: string;
  mappings: Array<{
    id: string;
    jsonPath: string;
    targetDomain: string;
    targetFieldKey: string;
    targetFieldName?: string;
  }>;
}

export function TransformationNodeInspector({ nodeId }: TransformationNodeInspectorProps) {
  const { workflow, updateNodeConfig, nodePreviewData, loadNodePreview, selectedCompanyId } = useWorkflowStore();
  const [dependencySelectorOpen, setDependencySelectorOpen] = useState(false);
  const [ssotDependencySelectorOpen, setSSOTDependencySelectorOpen] = useState(false);
  const [domains, setDomains] = useState<Array<{ domain: string; display_name: string }>>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<Array<{ domain: string; field_key: string; display_name: string; level: string; field_type: string }>>([]);
  
  const selectedNode = workflow.nodes.find(n => n.id === nodeId);
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Fetch SSOT schema for SSOT Map mode
  useEffect(() => {
    const fetchSSOTSchema = async () => {
      const { data: domainsData } = await supabase
        .from('company_domain_definitions')
        .select('domain, display_name')
        .order('sort_order');
      
      if (domainsData) {
        setDomains(domainsData);
      }

      const { data: fieldsData } = await supabase
        .from('company_field_definitions')
        .select('domain, field_key, display_name, level, field_type')
        .order('sort_order');
      
      if (fieldsData) {
        setFieldDefinitions(fieldsData);
      }
    };
    
    fetchSSOTSchema();
  }, []);

  if (!selectedNode) return null;

  const config = selectedNode.config;
  const scoringMode = config.scoringMode || false;
  const ssotMapMode = config.ssotMapMode || false;
  const scoreDependencies: ScoreDependency[] = config.scoreDependencies || [];
  const ssotMapDependencies: SSOTMapDependency[] = config.ssotMapDependencies || [];
  const stages: ScoreStageConfig[] = config.stages || DEFAULT_STAGES;

  // Determine current mode
  const currentMode = ssotMapMode ? 'ssotmap' : scoringMode ? 'scoring' : 'standard';

  // Load preview data for all score dependencies when they change or company changes
  useEffect(() => {
    if (scoringMode && scoreDependencies.length > 0 && selectedCompanyId) {
      scoreDependencies.forEach(dep => {
        loadNodePreview(dep.nodeId);
      });
    }
  }, [scoringMode, scoreDependencies.length, selectedCompanyId, loadNodePreview]);

  // Load preview data for SSOT Map dependencies (for value previews in cards)
  useEffect(() => {
    if (ssotMapMode && ssotMapDependencies.length > 0 && selectedCompanyId) {
      // Get unique node IDs
      const uniqueNodeIds = [...new Set(ssotMapDependencies.map(dep => dep.nodeId))];
      uniqueNodeIds.forEach(nodeId => {
        loadNodePreview(nodeId);
      });
    }
  }, [ssotMapMode, ssotMapDependencies.length, selectedCompanyId, loadNodePreview]);

  // Helper to get the extracted value for a dependency
  const getDependencyValue = (dep: ScoreDependency | SSOTMapDependency): { value: any; isLoading: boolean } | undefined => {
    const previewData = nodePreviewData.get(dep.nodeId);
    if (!previewData) return undefined;
    if (previewData.isLoading) return { value: undefined, isLoading: true };
    
    const extractedValue = getValueByPath(previewData.output, dep.jsonPath);
    return { value: extractedValue, isLoading: false };
  };

  const handleModeChange = (value: string) => {
    if (value) {
      if (value === 'standard') {
        updateNodeConfig(nodeId, { scoringMode: false, ssotMapMode: false });
      } else if (value === 'scoring') {
        updateNodeConfig(nodeId, { scoringMode: true, ssotMapMode: false });
        if (!config.stages) {
          updateNodeConfig(nodeId, { stages: DEFAULT_STAGES });
        }
      } else if (value === 'ssotmap') {
        updateNodeConfig(nodeId, { scoringMode: false, ssotMapMode: true });
      }
    }
  };

  const handleAddDependency = (
    depNodeId: string,
    nodeLabel: string,
    _nodeType: string,
    workflowId: string,
    workflowName: string
  ) => {
    const newDep: ScoreDependency = {
      id: crypto.randomUUID(),
      nodeId: depNodeId,
      nodeLabel,
      workflowId,
      workflowName,
      jsonPath: 'score',
      stage: stages[0]?.stage || 'ideation',
    };
    updateNodeConfig(nodeId, {
      scoreDependencies: [...scoreDependencies, newDep],
    });
  };

  const handleAddSSOTMapDependency = (
    depNodeId: string,
    nodeLabel: string,
    _nodeType: string,
    workflowId: string,
    workflowName: string
  ) => {
    // Add a new node entry with an empty first mapping
    const newDep: SSOTMapDependency = {
      id: crypto.randomUUID(),
      nodeId: depNodeId,
      nodeLabel,
      workflowId,
      workflowName,
      jsonPath: '', // Will be auto-populated by SSOTMappingCard
      targetDomain: '',
      targetFieldKey: '',
    };
    updateNodeConfig(nodeId, {
      ssotMapDependencies: [...ssotMapDependencies, newDep],
    });
  };

  const handleUpdateDependency = (depId: string, updates: Partial<ScoreDependency>) => {
    const updated = scoreDependencies.map(dep =>
      dep.id === depId ? { ...dep, ...updates } : dep
    );
    updateNodeConfig(nodeId, { scoreDependencies: updated });
  };

  const handleDeleteDependency = (depId: string) => {
    const filtered = scoreDependencies.filter(dep => dep.id !== depId);
    updateNodeConfig(nodeId, { scoreDependencies: filtered });
  };

  // Group SSOT mappings by nodeId for the card-based UI
  const ssotMappingsByNode = ssotMapDependencies.reduce((acc, dep) => {
    if (!acc[dep.nodeId]) {
      acc[dep.nodeId] = {
        nodeId: dep.nodeId,
        nodeLabel: dep.nodeLabel,
        workflowId: dep.workflowId,
        workflowName: dep.workflowName,
        mappings: [],
      };
    }
    acc[dep.nodeId].mappings.push({
      id: dep.id,
      jsonPath: dep.jsonPath,
      targetDomain: dep.targetDomain,
      targetFieldKey: dep.targetFieldKey,
      targetFieldName: dep.targetFieldName,
    });
    return acc;
  }, {} as Record<string, SSOTNodeMapping>);

  const handleUpdateNodeMappings = (targetNodeId: string, mappings: Array<{
    id: string;
    jsonPath: string;
    targetDomain: string;
    targetFieldKey: string;
    targetFieldName?: string;
  }>) => {
    const nodeInfo = ssotMappingsByNode[targetNodeId];
    if (!nodeInfo) return;

    // Remove old mappings for this node and add updated ones
    const otherMappings = ssotMapDependencies.filter(d => d.nodeId !== targetNodeId);
    const newMappings: SSOTMapDependency[] = mappings.map(m => ({
      id: m.id,
      nodeId: nodeInfo.nodeId,
      nodeLabel: nodeInfo.nodeLabel,
      workflowId: nodeInfo.workflowId,
      workflowName: nodeInfo.workflowName,
      jsonPath: m.jsonPath,
      targetDomain: m.targetDomain,
      targetFieldKey: m.targetFieldKey,
      targetFieldName: m.targetFieldName,
    }));

    updateNodeConfig(nodeId, {
      ssotMapDependencies: [...otherMappings, ...newMappings],
    });
  };

  const handleRemoveNode = (targetNodeId: string) => {
    const filtered = ssotMapDependencies.filter(d => d.nodeId !== targetNodeId);
    updateNodeConfig(nodeId, { ssotMapDependencies: filtered });
  };

  // Helper to get value for a path
  const getValueForPath = (targetNodeId: string, jsonPath: string): { value: any; isLoading: boolean } | undefined => {
    const previewData = nodePreviewData.get(targetNodeId);
    if (!previewData) return undefined;
    if (previewData.isLoading) return { value: undefined, isLoading: true };

    const extractedValue = getValueByPath(previewData.output, jsonPath);
    return { value: extractedValue, isLoading: false };
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = scoreDependencies.findIndex(d => d.id === active.id);
      const newIndex = scoreDependencies.findIndex(d => d.id === over.id);
      const reordered = arrayMove(scoreDependencies, oldIndex, newIndex);
      updateNodeConfig(nodeId, { scoreDependencies: reordered });
    }
  };

  const handleStageUpdate = (stageId: string, totalPossible: number) => {
    const updated = stages.map(s =>
      s.stage === stageId ? { ...s, totalPossible } : s
    );
    updateNodeConfig(nodeId, { stages: updated });
  };

  const handleConfigChange = (key: string, value: any) => {
    updateNodeConfig(nodeId, { [key]: value });
  };

  // Standard mode fields
  const renderStandardFields = () => (
    <div className="space-y-4">
      <div>
        <Label htmlFor="var_name">Name</Label>
        <Input
          id="var_name"
          value={config.name || ''}
          onChange={(e) => handleConfigChange('name', e.target.value)}
          placeholder="Variable name"
        />
      </div>

      <div>
        <Label htmlFor="var_type">Type</Label>
        <Select value={config.type || 'string'} onValueChange={(value) => handleConfigChange('type', value)}>
          <SelectTrigger id="var_type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="string">String</SelectItem>
            <SelectItem value="number">Number</SelectItem>
            <SelectItem value="boolean">Boolean</SelectItem>
            <SelectItem value="json">JSON</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="default">Default Value</Label>
        <Input
          id="default"
          value={config.default || ''}
          onChange={(e) => handleConfigChange('default', e.target.value)}
          placeholder="Default value"
        />
      </div>

      <div>
        <Label htmlFor="scope">Scope</Label>
        <Select value={config.scope || 'global'} onValueChange={(value) => handleConfigChange('scope', value)}>
          <SelectTrigger id="scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="global">Global</SelectItem>
            <SelectItem value="node">Node</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="outputName">Custom Output Name</Label>
        <Input
          id="outputName"
          value={config.outputName || ''}
          onChange={(e) => handleConfigChange('outputName', e.target.value)}
          placeholder="e.g., generated_summary, transformed_data"
        />
      </div>
    </div>
  );

  // Scoring mode fields
  const renderScoringFields = () => (
    <div className="space-y-4">
      {/* Score Builder Section */}
      <div>
        <Label className="text-sm font-semibold">Score Dependencies</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Select nodes and specify which JSON field contains the score
        </p>
        
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={scoreDependencies.map(d => d.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {scoreDependencies.map((dep) => (
                <SortableScoreItem
                  key={dep.id}
                  dep={dep}
                  stages={stages}
                  onUpdate={handleUpdateDependency}
                  onDelete={handleDeleteDependency}
                  dependencyValue={getDependencyValue(dep)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setDependencySelectorOpen(true)}
          className="w-full mt-2"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Score Dependency
        </Button>
      </div>

      {/* Stage Configuration Section */}
      <div className="pt-4 border-t border-border">
        <Label className="text-sm font-semibold">Stage Configuration</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Set the total possible score for each stage
        </p>
        
        <div className="space-y-2">
          {stages.map((stage) => (
            <div key={stage.stage} className="flex items-center gap-2">
              <span className="text-sm flex-1">{stage.label}</span>
              <Input
                type="number"
                value={stage.totalPossible}
                onChange={(e) => handleStageUpdate(stage.stage, parseInt(e.target.value) || 0)}
                className="w-20 h-8 text-sm text-right"
                min={0}
              />
            </div>
          ))}
        </div>
      </div>

      <DependencySelector
        open={dependencySelectorOpen}
        onOpenChange={setDependencySelectorOpen}
        currentWorkflowId={workflow.id}
        currentNodeId={nodeId}
        onSelect={handleAddDependency}
        selectedIds={scoreDependencies.map(d => d.nodeId)}
        title="Add Score Dependency"
        description="Select a node whose output contains a score value"
      />
    </div>
  );

  // SSOT Map mode fields
  const renderSSOTMapFields = () => (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-semibold">SSOT Field Mappings</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Add source nodes and map their output fields to Master Data
        </p>

        {/* Grouped node cards */}
        <div className="space-y-2">
          {Object.values(ssotMappingsByNode).map((nodeMapping) => (
            <SSOTMappingCard
              key={nodeMapping.nodeId}
              nodeId={nodeMapping.nodeId}
              nodeLabel={nodeMapping.nodeLabel}
              workflowId={nodeMapping.workflowId}
              workflowName={nodeMapping.workflowName}
              mappings={nodeMapping.mappings}
              domains={domains}
              fieldDefinitions={fieldDefinitions}
              selectedCompanyId={selectedCompanyId}
              onUpdateMappings={(mappings) => handleUpdateNodeMappings(nodeMapping.nodeId, mappings)}
              onRemoveNode={() => handleRemoveNode(nodeMapping.nodeId)}
              getValueForPath={getValueForPath}
            />
          ))}
        </div>

        {/* Add node button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSSOTDependencySelectorOpen(true)}
          className="w-full mt-2"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Source Node
        </Button>
      </div>

      <DependencySelector
        open={ssotDependencySelectorOpen}
        onOpenChange={setSSOTDependencySelectorOpen}
        currentWorkflowId={workflow.id}
        currentNodeId={nodeId}
        onSelect={handleAddSSOTMapDependency}
        selectedIds={Object.keys(ssotMappingsByNode)}
        title="Add Source Node"
        description="Select a node whose output contains values to map to Master Data"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div>
        <ToggleGroup
          type="single"
          value={currentMode}
          onValueChange={handleModeChange}
          className="justify-start w-full"
        >
          <ToggleGroupItem 
            value="standard" 
            className={cn(
              "flex-1 gap-2",
              currentMode === 'standard' && "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            <Settings className="w-4 h-4" />
            Standard
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="scoring" 
            className={cn(
              "flex-1 gap-2",
              currentMode === 'scoring' && "bg-amber-500 text-white hover:bg-amber-600"
            )}
          >
            <Calculator className="w-4 h-4" />
            Scoring
          </ToggleGroupItem>
          <ToggleGroupItem 
            value="ssotmap" 
            className={cn(
              "flex-1 gap-2",
              currentMode === 'ssotmap' && "bg-emerald-500 text-white hover:bg-emerald-600"
            )}
          >
            <Database className="w-4 h-4" />
            SSOT Map
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Mode-specific content */}
      {currentMode === 'scoring' && renderScoringFields()}
      {currentMode === 'ssotmap' && renderSSOTMapFields()}
      {currentMode === 'standard' && renderStandardFields()}
    </div>
  );
}
