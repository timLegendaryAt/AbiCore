import { useState } from 'react';
import { Trash2, Pause, Play, ArrowRightToLine, RefreshCw, Loader2, HardDrive } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AI_MODELS } from '@/types/ai-agent';
import { toast } from 'sonner';
import { MoveToCanvasDialog } from './MoveToCanvasDialog';
import { iconRegistry, iconOptions } from '@/lib/nodeDefaults';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function MultiNodeInspector() {
  const {
    workflow,
    selectedNodeIds,
    deleteSelectedNodes,
    updateNodeConfig,
    clearSelection,
    syncSharedCaches,
    selectedCompanyId,
  } = useWorkflowStore();
  
  // Get selected nodes
  const selectedNodes = workflow.nodes.filter(n => selectedNodeIds.includes(n.id));
  
  // Filter to promptTemplate nodes for LLM settings
  const promptTemplateNodes = selectedNodes.filter(n => n.type === 'promptTemplate');
  const hasPromptTemplates = promptTemplateNodes.length > 0;
  
  // Filter to dataset nodes with shared cache sources
  const sharedCacheNodes = selectedNodes.filter(
    n => n.type === 'dataset' && n.config?.sourceType === 'shared_cache' && n.config?.sharedCacheId
  );
  const hasSharedCacheNodes = sharedCacheNodes.length > 0;
  
  // Get unique cache IDs
  const uniqueCacheIds = [...new Set(sharedCacheNodes.map(n => n.config.sharedCacheId as string))];
  
  // Local state for LLM settings
  const [selectedModel, setSelectedModel] = useState('google/gemini-3-flash-preview');
  const [maxTokens, setMaxTokens] = useState(8000);
  const [temperature, setTemperature] = useState(0.7);
  const [selectedIcon, setSelectedIcon] = useState('MessageSquare');
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Bulk pause handlers
  const handlePauseAll = () => {
    selectedNodeIds.forEach(id => updateNodeConfig(id, { paused: true }));
    toast.success(`Paused ${selectedNodeIds.length} nodes`);
  };
  
  const handleUnpauseAll = () => {
    selectedNodeIds.forEach(id => updateNodeConfig(id, { paused: false }));
    toast.success(`Unpaused ${selectedNodeIds.length} nodes`);
  };
  
  // Apply LLM settings to all promptTemplate nodes
  const handleApplyLLMSettings = () => {
    promptTemplateNodes.forEach(node => {
      updateNodeConfig(node.id, { model: selectedModel, max_tokens: maxTokens, temperature, customIcon: selectedIcon });
    });
    toast.success(`Updated ${promptTemplateNodes.length} generative nodes`);
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };
  
  const confirmDelete = () => {
    const count = selectedNodeIds.length;
    deleteSelectedNodes();
    toast.success(`Deleted ${count} nodes`);
  };
  
  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="text-center">
        <h3 className="font-semibold text-foreground">{selectedNodeIds.length} nodes selected</h3>
        {hasPromptTemplates && (
          <p className="text-sm text-muted-foreground">
            {promptTemplateNodes.length} generative node{promptTemplateNodes.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
      
      {/* Delete Section */}
      <Button variant="destructive" onClick={handleDelete} className="w-full">
        <Trash2 className="mr-2 h-4 w-4" />
        Delete Selected
      </Button>
      
      {/* Pause Section */}
      <div className="space-y-2">
        <Label>Pause Control</Label>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePauseAll} className="flex-1">
            <Pause className="mr-2 h-4 w-4" />
            Pause All
          </Button>
          <Button variant="outline" onClick={handleUnpauseAll} className="flex-1">
            <Play className="mr-2 h-4 w-4" />
            Unpause All
          </Button>
        </div>
      </div>
      
      {/* LLM Settings (only if promptTemplate nodes selected) */}
      {hasPromptTemplates && (
        <div className="space-y-3 border-t border-border pt-4">
          <Label>LLM Parameters ({promptTemplateNodes.length} nodes)</Label>
          
          <div>
            <span className="text-xs text-muted-foreground">Model</span>
            <Select value={selectedModel} onValueChange={setSelectedModel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Google Gemini</SelectLabel>
                  {AI_MODELS.filter(m => m.provider === 'google').map(model => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>OpenAI</SelectLabel>
                  {AI_MODELS.filter(m => m.provider === 'openai').map(model => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                <SelectGroup>
                  <SelectLabel>Perplexity Sonar</SelectLabel>
                  {AI_MODELS.filter(m => m.provider === 'perplexity').map(model => (
                    <SelectItem key={model.value} value={model.value}>
                      {model.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <span className="text-xs text-muted-foreground">Icon</span>
            <Select value={selectedIcon} onValueChange={setSelectedIcon}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  {(() => {
                    const IconComp = iconRegistry[selectedIcon];
                    return IconComp ? <IconComp className="w-4 h-4" /> : null;
                  })()}
                  <span>{iconOptions.find(o => o.name === selectedIcon)?.label || 'Select icon'}</span>
                </div>
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {iconOptions.map((opt) => {
                  const OptIcon = iconRegistry[opt.name];
                  return (
                    <SelectItem key={opt.name} value={opt.name}>
                      <div className="flex items-center gap-2">
                        {OptIcon && <OptIcon className="w-4 h-4" />}
                        <span>{opt.label}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <span className="text-xs text-muted-foreground">Max Tokens</span>
            <div className="flex items-center gap-4">
              <Slider 
                value={[maxTokens]} 
                onValueChange={([v]) => setMaxTokens(v)} 
                min={100} 
                max={16000} 
                step={100} 
                className="flex-1" 
              />
              <span className="text-sm w-16 text-right text-muted-foreground">{maxTokens}</span>
            </div>
          </div>
          
          <div>
            <span className="text-xs text-muted-foreground">Temperature</span>
            <div className="flex items-center gap-4">
              <Slider 
                value={[temperature]} 
                onValueChange={([v]) => setTemperature(v)}
                min={0} 
                max={1} 
                step={0.1} 
                className="flex-1" 
              />
              <span className="text-sm w-12 text-right text-muted-foreground">{temperature.toFixed(1)}</span>
            </div>
          </div>
          
          <Button onClick={handleApplyLLMSettings} className="w-full">
            Apply to {promptTemplateNodes.length} Node{promptTemplateNodes.length !== 1 ? 's' : ''}
          </Button>
        </div>
      )}
      
      {/* Shared Cache Sync (only if dataset nodes with shared caches selected) */}
      {hasSharedCacheNodes && selectedCompanyId && (
        <div className="space-y-2 border-t border-border pt-4">
          <Label className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-violet-500" />
            Shared Caches ({uniqueCacheIds.length})
          </Label>
          <Button
            variant="outline"
            onClick={async () => {
              setIsSyncing(true);
              const result = await syncSharedCaches(uniqueCacheIds);
              setIsSyncing(false);
              if (result.success) {
                toast.success(result.message);
              } else {
                toast.error(result.message);
              }
            }}
            disabled={isSyncing}
            className="w-full gap-2"
          >
            {isSyncing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Syncing {uniqueCacheIds.length} Cache{uniqueCacheIds.length !== 1 ? 's' : ''}...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Sync {uniqueCacheIds.length} Cache{uniqueCacheIds.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      )}
      
      {/* Move to Canvas */}
      <div className="border-t border-border pt-4">
        <Button variant="outline" onClick={() => setShowMoveDialog(true)} className="w-full">
          <ArrowRightToLine className="mr-2 h-4 w-4" />
          Move to New Canvas
        </Button>
      </div>
      
      {/* Clear Selection */}
      <Button variant="ghost" onClick={clearSelection} className="w-full">
        Clear Selection
      </Button>
      
      {showMoveDialog && (
        <MoveToCanvasDialog 
          nodeIds={selectedNodeIds}
          onClose={() => setShowMoveDialog(false)}
        />
      )}
      
      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedNodeIds.length} nodes?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const names = selectedNodes.map(n => n.label).filter(Boolean).slice(0, 5);
                const remaining = selectedNodeIds.length - names.length;
                return (
                  <>
                    This will permanently remove: <strong>{names.join(', ')}</strong>
                    {remaining > 0 && ` and ${remaining} more`}.
                    This action cannot be undone.
                  </>
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
