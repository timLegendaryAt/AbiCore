import { useState, useRef, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NodeInspector } from './NodeInspector';
import { cn } from '@/lib/utils';

import { PromptBuilderTab } from './PromptBuilderTab';
import { ImprovementPanel } from './ImprovementPanel';
import { PerformancePanel } from './PerformancePanel';
import { NodePreviewTab } from './NodePreviewTab';
import { LoadingTab } from './LoadingTab';
import { useWorkflowStore } from '@/store/workflowStore';

export function InspectorPanel() {
  const {
    workflow,
    selectedNodeIds,
    currentLayer,
    isInspectorOpen,
    inspectorTab,
    setInspectorOpen,
    setInspectorTab,
    updateNode,
    deleteNode,
    clearSelection,
  } = useWorkflowStore();
  
  const selectedNode = selectedNodeIds.length === 1 
    ? workflow.nodes.find(n => n.id === selectedNodeIds[0])
    : undefined;
  
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editedLabel, setEditedLabel] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isEditingLabel && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingLabel]);
  
  const handleStartEdit = () => {
    if (selectedNode) {
      setEditedLabel(selectedNode.label);
      setIsEditingLabel(true);
    }
  };
  
  const handleSaveLabel = () => {
    if (selectedNode && editedLabel.trim()) {
      updateNode(selectedNode.id, { label: editedLabel.trim() });
    }
    setIsEditingLabel(false);
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveLabel();
    } else if (e.key === 'Escape') {
      setIsEditingLabel(false);
    }
  };
  
  const handleDelete = () => {
    if (selectedNode) {
      deleteNode(selectedNode.id);
      clearSelection();
    }
  };
  
  const showPromptBuilder = selectedNode?.type === 'promptTemplate';
  const showImprovement = currentLayer === 'improvement';
  const showPerformance = currentLayer === 'performance';
  
  // Visual-only node types that cannot be executed
  const visualOnlyTypes = ['note', 'shape', 'divider', 'floatingEndpoint'];

  // Show Preview tab only for executable nodes
  const showPreview = selectedNode && !visualOnlyTypes.includes(selectedNode.type);
  
  // Show Loading tab only for executable nodes  
  const showLoading = selectedNode && !visualOnlyTypes.includes(selectedNode.type);
  
  return (
    <div className={cn(
      "bg-inspector-bg border-l border-border transition-all duration-300 ease-in-out relative flex flex-col h-full",
      isInspectorOpen ? "w-96" : "w-0"
    )}>
      <Button 
        variant="ghost" 
        size="sm" 
        onClick={() => setInspectorOpen(!isInspectorOpen)} 
        className={cn(
          "absolute -left-10 top-4 h-8 w-8 rounded-md bg-card border border-border shadow-sm hover:bg-accent z-10"
        )}
      >
        {isInspectorOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </Button>
      
      <div className={cn(
        "flex-1 flex flex-col min-h-0 transition-opacity duration-300",
        isInspectorOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        {showImprovement ? (
          // IMPROVEMENT MODE: Show only improvement panel
          <div className="flex flex-col h-full">
            <div className="border-b border-border p-4 flex-shrink-0">
              <h2 className="font-semibold text-lg text-foreground">Improvement Analysis</h2>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-4">
              <ImprovementPanel />
            </div>
          </div>
        ) : showPerformance ? (
          // PERFORMANCE MODE: Show only performance panel
          <div className="flex flex-col h-full overflow-hidden">
            <div className="border-b border-border p-4 flex-shrink-0">
              <h2 className="font-semibold text-lg text-foreground">Performance Analysis</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Token usage, speed, and cost metrics
              </p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <PerformancePanel />
            </div>
          </div>
        ) : (
          // FRAMEWORK MODE: Show normal tabs
          <Tabs 
            value={inspectorTab} 
            onValueChange={(value) => setInspectorTab(value as 'inspector' | 'prompt-builder' | 'preview' | 'loading')}
            className="flex flex-col h-full"
          >
            {/* Header with editable title and delete button */}
            {selectedNode && (
              <div className="flex items-center justify-between px-4 py-2 border-b border-border flex-shrink-0">
                <div className="flex items-center gap-2 flex-1 min-w-0 group">
                  {isEditingLabel ? (
                    <Input
                      ref={inputRef}
                      value={editedLabel}
                      onChange={(e) => setEditedLabel(e.target.value)}
                      onBlur={handleSaveLabel}
                      onKeyDown={handleKeyDown}
                      className="h-7 text-sm font-medium"
                    />
                  ) : (
                    <button
                      onClick={handleStartEdit}
                      className="flex items-center gap-2 text-foreground hover:text-foreground/80 text-left"
                    >
                      <span className="text-lg font-semibold leading-tight line-clamp-2">{selectedNode.label}</span>
                      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 flex-shrink-0 transition-opacity" />
                    </button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDelete}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
            
            <TabsList className="w-full justify-start rounded-none border-b border-border bg-transparent p-0 pl-4 h-10 flex-shrink-0">
              <TabsTrigger 
                value="inspector" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                Inspector
              </TabsTrigger>
              {showPromptBuilder && (
                <TabsTrigger 
                  value="prompt-builder" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  Prompt Builder
                </TabsTrigger>
              )}
              {showPreview && (
                <TabsTrigger 
                  value="preview" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  Preview
                </TabsTrigger>
              )}
              {showLoading && (
                <TabsTrigger 
                  value="loading" 
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
                >
                  Loading
                </TabsTrigger>
              )}
            </TabsList>

            {/* Single scroll container for all tab content */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <TabsContent value="inspector" className="m-0 p-4 h-full">
                <NodeInspector />
              </TabsContent>

              {showPromptBuilder && (
                <TabsContent value="prompt-builder" className="m-0 p-4 h-full">
                  <PromptBuilderTab />
                </TabsContent>
              )}
              
              {showPreview && selectedNode && (
                <TabsContent value="preview" className="m-0 p-4 h-full">
                  <NodePreviewTab nodeId={selectedNode.id} />
                </TabsContent>
              )}
              
              {showLoading && (
                <TabsContent value="loading" className="m-0 p-4 h-full">
                  <LoadingTab />
                </TabsContent>
              )}
            </div>
          </Tabs>
        )}
      </div>
    </div>
  );
}