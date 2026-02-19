import { useState, useRef, useEffect } from 'react';
import { ClipboardList, AlignLeft, AlignCenter, AlignRight, Pencil } from 'lucide-react';
import { MultiNodeInspector } from './MultiNodeInspector';
import { useWorkflowStore } from '@/store/workflowStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { PromptBuilder } from '@/components/workflow/PromptBuilder';
import { PromptPart } from '@/types/workflow';
import { WorkflowNodeInspector } from '@/components/workflow/WorkflowNodeInspector';
import { FrameworkNodeInspector } from '@/components/workflow/FrameworkNodeInspector';
import { DatasetNodeInspector } from '@/components/workflow/DatasetNodeInspector';
import { IngestNodeInspector } from '@/components/workflow/IngestNodeInspector';
import { IntegrationNodeInspector } from '@/components/workflow/IntegrationNodeInspector';
import { AgentNodeInspector } from '@/components/workflow/AgentNodeInspector';
import { TransformationNodeInspector } from '@/components/workflow/TransformationNodeInspector';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AI_MODELS } from '@/types/ai-agent';

export function NodeInspector() {
  const {
    workflow,
    selectedNodeIds,
    updateNodeConfig,
    clearSelection,
  } = useWorkflowStore();

  // All hooks MUST be called before any conditional returns
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditingDescription && descriptionRef.current) {
      descriptionRef.current.focus();
    }
  }, [isEditingDescription]);

  // Handle no selection
  if (selectedNodeIds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <ClipboardList className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-foreground mb-2">No node selected</h3>
        <p className="text-sm text-muted-foreground">Select a node to edit its properties</p>
      </div>
    );
  }

  // Handle multi-selection
  if (selectedNodeIds.length > 1) {
    return <MultiNodeInspector />;
  }

  const selectedNode = workflow.nodes.find(n => n.id === selectedNodeIds[0]);

  if (!selectedNode) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <ClipboardList className="w-16 h-16 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-foreground mb-2">No node selected</h3>
        <p className="text-sm text-muted-foreground">Select a node to edit its properties</p>
      </div>
    );
  }
  const handleConfigChange = (key: string, value: any) => {
    updateNodeConfig(selectedNode.id, {
      [key]: value
    });
  };
  const getAvailableDependencies = () => {
    return workflow.nodes.filter(node => node.id !== selectedNode?.id).map(node => ({
      id: node.id,
      label: node.label
    }));
  };

  // Migrate old dependencies to new promptParts format
  const migrateToPromptParts = (config: any): PromptPart[] => {
    if (config.promptParts) return config.promptParts;
    if (!config.dependencies || config.dependencies.length === 0) return [];

    // Convert old dependencies array to promptParts
    return config.dependencies.map((depLabel: string, index: number) => {
      const node = workflow.nodes.find(n => n.label === depLabel);
      return {
        id: crypto.randomUUID(),
        type: 'dependency' as const,
        value: node?.id || depLabel,
        // Use node ID if found, fallback to label
        order: index
      };
    });
  };
  const handlePromptPartsChange = (parts: PromptPart[]) => {
    handleConfigChange('promptParts', parts);
    // Clear old dependencies field
    if (selectedNode?.config.dependencies) {
      handleConfigChange('dependencies', undefined);
    }
  };

  const renderOutputNameField = () => <div>
      <Label htmlFor="outputName">Custom Output Name</Label>
      
      <Input id="outputName" value={selectedNode?.config.outputName || ''} onChange={e => handleConfigChange('outputName', e.target.value)} placeholder="e.g., generated_summary, transformed_data" />
    </div>;
  const renderPromptTemplateFields = () => <div className="space-y-4">
      {/* Description Section - Click to Edit */}
      <div>
        <Label>Description</Label>
        {isEditingDescription ? (
          <Textarea 
            ref={descriptionRef}
            value={selectedNode.config.description || ''} 
            onChange={e => handleConfigChange('description', e.target.value)} 
            onBlur={() => setIsEditingDescription(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setIsEditingDescription(false);
            }}
            placeholder="Brief description of what this node does..."
            rows={2}
          />
        ) : (
          <button
            onClick={() => setIsEditingDescription(true)}
            className="w-full text-left p-2 rounded-md border border-transparent hover:border-border hover:bg-muted/50 group flex items-start gap-2 min-h-[40px]"
          >
            <span className="text-sm text-foreground flex-1">
              {selectedNode.config.description || (
                <span className="text-muted-foreground italic">Click to add description...</span>
              )}
            </span>
            <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
          </button>
        )}
        
      </div>

      {/* Model Section */}
      <div className="pt-4 border-t border-border">
        <Label htmlFor="model">Model</Label>
        <Select value={selectedNode.config.model || 'google/gemini-3-flash-preview'} onValueChange={value => handleConfigChange('model', value)}>
          <SelectTrigger id="model" className="h-auto min-h-[52px] py-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Google Gemini</SelectLabel>
              {AI_MODELS.filter(m => m.provider === 'google').map(model => (
                <SelectItem key={model.value} value={model.value} className="py-2.5">
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="font-medium">{model.label}</span>
                    <span className="text-xs text-muted-foreground leading-relaxed">{model.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>OpenAI</SelectLabel>
              {AI_MODELS.filter(m => m.provider === 'openai').map(model => (
                <SelectItem key={model.value} value={model.value} className="py-2.5">
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="font-medium">{model.label}</span>
                    <span className="text-xs text-muted-foreground leading-relaxed">{model.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Perplexity Sonar</SelectLabel>
              {AI_MODELS.filter(m => m.provider === 'perplexity').map(model => (
                <SelectItem key={model.value} value={model.value} className="py-2.5">
                  <div className="flex flex-col items-start gap-0.5">
                    <span className="font-medium">{model.label}</span>
                    <span className="text-xs text-muted-foreground leading-relaxed">{model.description}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      {/* Tokens Section */}
      <div className="pt-4 border-t border-border space-y-3">
        <Label>Tokens</Label>
        
        {/* Max Tokens */}
        <div>
          <span className="text-xs text-muted-foreground">Max Tokens</span>
          <div className="flex items-center gap-4">
            <Slider
              id="max_tokens"
              value={[selectedNode.config.max_tokens || 8000]}
              onValueChange={([value]) => handleConfigChange('max_tokens', value)}
              min={100}
              max={16000}
              step={100}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-16 text-right">
              {selectedNode.config.max_tokens || 8000}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Maximum output length. Increase for complex JSON outputs.
          </p>
        </div>
        
        {/* Temperature */}
        <div>
          <span className="text-xs text-muted-foreground">Temperature</span>
          <div className="flex items-center gap-4">
            <Slider
              id="temperature"
              value={[selectedNode.config.temperature ?? 0.7]}
              onValueChange={([value]) => handleConfigChange('temperature', value)}
              min={0}
              max={1}
              step={0.1}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-12 text-right">
              {(selectedNode.config.temperature ?? 0.7).toFixed(1)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Lower = precise/deterministic, Higher = creative/varied
          </p>
        </div>
      </div>

      {/* Toggles Section */}
      <div className="pt-4 border-t border-border space-y-3">
        {/* Web Search toggle - only for Gemini models */}
        {(() => {
          const currentModel = AI_MODELS.find(m => m.value === selectedNode.config.model);
          if (currentModel?.supportsWebSearch) {
            return (
              <div className="flex items-center space-x-2">
                <Switch 
                  id="webSearch" 
                  checked={selectedNode.config.webSearch || false} 
                  onCheckedChange={checked => handleConfigChange('webSearch', checked)} 
                />
                <Label htmlFor="webSearch" className="flex flex-col">
                  <span>Enable Web Search</span>
                  <span className="text-xs text-muted-foreground font-normal">Ground responses with real-time Google Search results</span>
                </Label>
              </div>
            );
          }
          return null;
        })()}

        {/* No-Match Stop Trigger */}
        <div className="flex items-center space-x-2">
          <Switch 
            id="enableStopTrigger" 
            checked={selectedNode.config.enableStopTrigger || false} 
            onCheckedChange={checked => handleConfigChange('enableStopTrigger', checked)} 
          />
          <Label htmlFor="enableStopTrigger" className="flex flex-col">
            <span>Enable No-Match Stop</span>
            <span className="text-xs text-muted-foreground font-normal">
              Appends instruction to output "f8Tsc" if no match. Stops downstream nodes.
            </span>
          </Label>
        </div>

        {/* Pause Toggle */}
        <div className="flex items-center space-x-2">
          <Switch
            id="pause_node"
            checked={selectedNode.config.paused || false}
            onCheckedChange={(checked) => handleConfigChange('paused', !!checked)}
          />
          <Label htmlFor="pause_node" className="flex flex-col">
            <span>Pause This Node</span>
            <span className="text-xs text-muted-foreground font-normal">
              Skip this node and all downstream during workflow runs
            </span>
          </Label>
        </div>
      </div>
    </div>;
  const renderPromptPieceFields = () => <div className="space-y-4">
      <div>
        <Label htmlFor="content">Content</Label>
        <Textarea id="content" value={selectedNode.config.content || ''} onChange={e => handleConfigChange('content', e.target.value)} placeholder="Enter content with ${variable} interpolation" rows={6} />
      </div>

      <div className="flex items-center space-x-2">
        <Switch id="append_newline" checked={selectedNode.config.append_newline || false} onCheckedChange={checked => handleConfigChange('append_newline', checked)} />
        <Label htmlFor="append_newline">Append newline</Label>
      </div>
    </div>;
  const renderVariableFields = () => <div className="space-y-4">
      <div>
        <Label htmlFor="var_name">Name</Label>
        <Input id="var_name" value={selectedNode.config.name || ''} onChange={e => handleConfigChange('name', e.target.value)} placeholder="Variable name" />
      </div>

      <div>
        <Label htmlFor="var_type">Type</Label>
        <Select value={selectedNode.config.type || 'string'} onValueChange={value => handleConfigChange('type', value)}>
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
        <Input id="default" value={selectedNode.config.default || ''} onChange={e => handleConfigChange('default', e.target.value)} placeholder="Default value" />
      </div>

      <div>
        <Label htmlFor="scope">Scope</Label>
        <Select value={selectedNode.config.scope || 'global'} onValueChange={value => handleConfigChange('scope', value)}>
          <SelectTrigger id="scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="global">Global</SelectItem>
            <SelectItem value="node">Node</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {renderOutputNameField()}
    </div>;
  const renderNoteFields = () => <div className="space-y-4">
      <div>
        <Label htmlFor="note_text">Description</Label>
        <Textarea id="note_text" value={(selectedNode.config as any).text || ''} onChange={e => handleConfigChange('text', e.target.value)} placeholder="Enter description text..." className="min-h-[120px]" />
      </div>

      <div>
        <Label htmlFor="note_labelFontSize">Title Font Size</Label>
        <Select value={(selectedNode.config as any).labelFontSize || 'large'} onValueChange={value => handleConfigChange('labelFontSize', value)}>
          <SelectTrigger id="note_labelFontSize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="small">Small</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="large">Large</SelectItem>
            <SelectItem value="xlarge">X-Large</SelectItem>
            <SelectItem value="xxlarge">XX-Large</SelectItem>
            <SelectItem value="xxxlarge">XXX-Large</SelectItem>
            <SelectItem value="display-sm">Display Small</SelectItem>
            <SelectItem value="display-md">Display Medium</SelectItem>
            <SelectItem value="display-lg">Display Large</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground mt-1">Controls the node label size</p>
      </div>

      <div>
        <Label htmlFor="note_fontSize">Description Font Size</Label>
        <Select value={(selectedNode.config as any).fontSize || 'medium'} onValueChange={value => handleConfigChange('fontSize', value)}>
          <SelectTrigger id="note_fontSize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="small">Small</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="large">Large</SelectItem>
            <SelectItem value="xlarge">X-Large</SelectItem>
            <SelectItem value="xxlarge">XX-Large</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="note_align">Text Alignment</Label>
        <ToggleGroup 
          type="single" 
          value={(selectedNode.config as any).textAlign || 'left'} 
          onValueChange={(value) => value && handleConfigChange('textAlign', value)}
          className="justify-start mt-2"
        >
          <ToggleGroupItem value="left" aria-label="Align left">
            <AlignLeft className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="center" aria-label="Align center">
            <AlignCenter className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="right" aria-label="Align right">
            <AlignRight className="h-4 w-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div>
        <Label htmlFor="note_color">Color</Label>
        <div className="flex gap-2 flex-wrap mt-2">
          {[
            { name: 'Red', value: '#ef4444' },
            { name: 'Rose', value: '#f43f5e' },
            { name: 'Orange', value: '#f97316' },
            { name: 'Yellow', value: '#eab308' },
            { name: 'Green', value: '#10b981' },
            { name: 'Teal', value: '#14b8a6' },
            { name: 'Cyan', value: '#06b6d4' },
            { name: 'Blue', value: '#3b82f6' },
            { name: 'Primary', value: '#6366f1' },
            { name: 'Purple', value: '#a855f7' },
            { name: 'Pink', value: '#ec4899' },
            { name: 'Gray', value: '#64748b' },
          ].map(color => <button key={color.value} onClick={() => handleConfigChange('color', color.value)} className="w-10 h-10 rounded-lg border-2 transition-all hover:scale-110" style={{
            backgroundColor: color.value,
            borderColor: (selectedNode.config as any).color === color.value ? '#000' : 'transparent'
          }} title={color.name} />)}
        </div>
      </div>
    </div>;

  const renderDividerFields = () => <div className="space-y-4">
      <div>
        <Label htmlFor="divider_orientation">Orientation</Label>
        <Select value={(selectedNode.config as any).orientation || 'horizontal'} onValueChange={value => handleConfigChange('orientation', value)}>
          <SelectTrigger id="divider_orientation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="horizontal">Horizontal</SelectItem>
            <SelectItem value="vertical">Vertical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="divider_length">Length</Label>
        <div className="flex items-center gap-4 mt-2">
          <Slider
            id="divider_length"
            value={[(selectedNode.config as any).length || 200]}
            onValueChange={([value]) => handleConfigChange('length', value)}
            min={50}
            max={800}
            step={10}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground w-12 text-right">
            {(selectedNode.config as any).length || 200}px
          </span>
        </div>
      </div>

      <div>
        <Label htmlFor="divider_strokeWidth">Thickness</Label>
        <div className="flex items-center gap-4 mt-2">
          <Slider
            id="divider_strokeWidth"
            value={[(selectedNode.config as any).strokeWidth || 2]}
            onValueChange={([value]) => handleConfigChange('strokeWidth', value)}
            min={1}
            max={10}
            step={1}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground w-12 text-right">
            {(selectedNode.config as any).strokeWidth || 2}px
          </span>
        </div>
      </div>

      <div>
        <Label htmlFor="divider_style">Line Style</Label>
        <Select value={(selectedNode.config as any).style || 'solid'} onValueChange={value => handleConfigChange('style', value)}>
          <SelectTrigger id="divider_style">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="dashed">Dashed</SelectItem>
            <SelectItem value="dotted">Dotted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Color</Label>
        <div className="flex gap-2 flex-wrap mt-2">
          {[
            { name: 'Gray', value: '#94a3b8' },
            { name: 'Slate', value: '#64748b' },
            { name: 'Red', value: '#ef4444' },
            { name: 'Orange', value: '#f97316' },
            { name: 'Yellow', value: '#eab308' },
            { name: 'Green', value: '#10b981' },
            { name: 'Teal', value: '#14b8a6' },
            { name: 'Blue', value: '#3b82f6' },
            { name: 'Primary', value: '#6366f1' },
            { name: 'Purple', value: '#a855f7' },
          ].map(color => (
            <button
              key={color.value}
              onClick={() => handleConfigChange('color', color.value)}
              className="w-10 h-10 rounded-lg border-2 transition-all hover:scale-110"
              style={{
                backgroundColor: color.value,
                borderColor: (selectedNode.config as any).color === color.value ? '#000' : 'transparent'
              }}
              title={color.name}
            />
          ))}
        </div>
      </div>
    </div>;

  const renderShapeFields = () => <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="shape_width">Width</Label>
          <div className="flex items-center gap-2 mt-2">
            <Slider
              id="shape_width"
              value={[(selectedNode.config as any).width || 300]}
              onValueChange={([value]) => handleConfigChange('width', value)}
              min={100}
              max={800}
              step={10}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-12 text-right">
              {(selectedNode.config as any).width || 300}
            </span>
          </div>
        </div>
        <div>
          <Label htmlFor="shape_height">Height</Label>
          <div className="flex items-center gap-2 mt-2">
            <Slider
              id="shape_height"
              value={[(selectedNode.config as any).height || 200]}
              onValueChange={([value]) => handleConfigChange('height', value)}
              min={50}
              max={600}
              step={10}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-12 text-right">
              {(selectedNode.config as any).height || 200}
            </span>
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="shape_borderWidth">Border Width</Label>
        <div className="flex items-center gap-4 mt-2">
          <Slider
            id="shape_borderWidth"
            value={[(selectedNode.config as any).borderWidth || 2]}
            onValueChange={([value]) => handleConfigChange('borderWidth', value)}
            min={1}
            max={8}
            step={1}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground w-12 text-right">
            {(selectedNode.config as any).borderWidth || 2}px
          </span>
        </div>
      </div>

      <div>
        <Label htmlFor="shape_borderStyle">Border Style</Label>
        <Select value={(selectedNode.config as any).borderStyle || 'dashed'} onValueChange={value => handleConfigChange('borderStyle', value)}>
          <SelectTrigger id="shape_borderStyle">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="solid">Solid</SelectItem>
            <SelectItem value="dashed">Dashed</SelectItem>
            <SelectItem value="dotted">Dotted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="shape_borderRadius">Corner Radius</Label>
        <div className="flex items-center gap-4 mt-2">
          <Slider
            id="shape_borderRadius"
            value={[(selectedNode.config as any).borderRadius || 8]}
            onValueChange={([value]) => handleConfigChange('borderRadius', value)}
            min={0}
            max={50}
            step={2}
            className="flex-1"
          />
          <span className="text-sm text-muted-foreground w-12 text-right">
            {(selectedNode.config as any).borderRadius || 8}px
          </span>
        </div>
      </div>

      <div>
        <Label>Fill Color</Label>
        <div className="flex gap-2 flex-wrap mt-2">
          {[
            { name: 'None', value: 'transparent' },
            { name: 'Gray', value: '#94a3b8' },
            { name: 'Slate', value: '#64748b' },
            { name: 'Red', value: '#ef4444' },
            { name: 'Orange', value: '#f97316' },
            { name: 'Yellow', value: '#eab308' },
            { name: 'Green', value: '#10b981' },
            { name: 'Teal', value: '#14b8a6' },
            { name: 'Cyan', value: '#06b6d4' },
            { name: 'Blue', value: '#3b82f6' },
            { name: 'Primary', value: '#6366f1' },
            { name: 'Purple', value: '#a855f7' },
          ].map(color => (
            <button
              key={color.value}
              onClick={() => handleConfigChange('backgroundColor', color.value)}
              className="w-10 h-10 rounded-lg border-2 transition-all hover:scale-110"
              style={{
                backgroundColor: color.value,
                borderColor: (selectedNode.config as any).backgroundColor === color.value ? '#000' : '#e2e8f0'
              }}
              title={color.name}
            />
          ))}
        </div>
      </div>

      <div>
        <Label>Border Color</Label>
        <div className="flex gap-2 flex-wrap mt-2">
          {[
            { name: 'Gray', value: '#94a3b8' },
            { name: 'Slate', value: '#64748b' },
            { name: 'Red', value: '#ef4444' },
            { name: 'Orange', value: '#f97316' },
            { name: 'Yellow', value: '#eab308' },
            { name: 'Green', value: '#10b981' },
            { name: 'Teal', value: '#14b8a6' },
            { name: 'Cyan', value: '#06b6d4' },
            { name: 'Blue', value: '#3b82f6' },
            { name: 'Primary', value: '#6366f1' },
            { name: 'Purple', value: '#a855f7' },
          ].map(color => (
            <button
              key={color.value}
              onClick={() => handleConfigChange('borderColor', color.value)}
              className="w-10 h-10 rounded-lg border-2 transition-all hover:scale-110"
              style={{
                backgroundColor: color.value,
                borderColor: (selectedNode.config as any).borderColor === color.value ? '#000' : 'transparent'
              }}
              title={color.name}
            />
          ))}
        </div>
      </div>
    </div>;
  return <div className="space-y-4">

      {selectedNode.type === 'promptTemplate' && renderPromptTemplateFields()}
      {selectedNode.type === 'promptPiece' && renderPromptPieceFields()}
      {selectedNode.type === 'ingest' && <IngestNodeInspector nodeId={selectedNode.id} />}
      {selectedNode.type === 'dataset' && <DatasetNodeInspector nodeId={selectedNode.id} />}
      {selectedNode.type === 'variable' && <TransformationNodeInspector nodeId={selectedNode.id} />}
      {selectedNode.type === 'framework' && <FrameworkNodeInspector nodeId={selectedNode.id} />}
      {selectedNode.type === 'note' && renderNoteFields()}
      {selectedNode.type === 'divider' && renderDividerFields()}
      {selectedNode.type === 'shape' && renderShapeFields()}
      {selectedNode.type === 'workflow' && <WorkflowNodeInspector nodeId={selectedNode.id} />}
      {selectedNode.type === 'integration' && <IntegrationNodeInspector nodeId={selectedNode.id} />}
      {selectedNode.type === 'agent' && <AgentNodeInspector nodeId={selectedNode.id} />}
    </div>;
}