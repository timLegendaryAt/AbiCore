import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { MessageSquare, Puzzle, Database, Variable, AlertCircle, Book, Bot, Network, ArrowRight, Download, Plug, Copy, Pause, Zap, Loader2, Trash2, Globe } from 'lucide-react';
import { NodeBase } from '@/types/workflow';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useWorkflowStore } from '@/store/workflowStore';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { IconPickerPopover } from '../IconPickerPopover';
import { iconRegistry } from '@/lib/nodeDefaults';

interface WorkflowNodeProps {
  data: NodeBase;
  selected?: boolean;
}

export function WorkflowNode({ data: node, selected }: WorkflowNodeProps) {
  const navigate = useNavigate();
  const { loadWorkflow, loadWorkflows, workflow, duplicateNode, forceRunCascade, runSystemWorkflows, selectedCompanyId, isForceRunning, isSystemRunning, deleteNode, cascadeProgress, updateNodeConfig } = useWorkflowStore();
  const [isRunningThisNode, setIsRunningThisNode] = useState(false);
  const [isRunningSystem, setIsRunningSystem] = useState(false);

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    duplicateNode(node.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete "${node.label || 'this node'}"?`)) {
      deleteNode(node.id);
    }
  };

  const handleForceRun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedCompanyId) {
      toast.error('Please select a company first');
      return;
    }
    
    setIsRunningThisNode(true);
    // Use the cascade orchestration starting from this node
    const result = await forceRunCascade(node.id);
    setIsRunningThisNode(false);
    
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  // Check if this node type supports force run
  const supportsForceRun = ['promptTemplate', 'ingest', 'dataset', 'agent'].includes(node.type);

  // Helper to check if a handle has connections
  const isHandleConnected = (handleId: string): boolean => {
    return workflow.edges.some(
      edge => 
        (edge.from.node === node.id && edge.from.port === handleId) ||
        (edge.to.node === node.id && edge.to.port === handleId)
    );
  };

  const handleNavigateToWorkflow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (node.type === 'workflow' && node.config.workflowId) {
      try {
        const workflows = await loadWorkflows();
        const targetWorkflow = workflows.find(w => w.id === node.config.workflowId);
        
        if (targetWorkflow) {
          loadWorkflow(targetWorkflow);
          navigate('/');
        }
      } catch (error) {
        console.error('Error navigating to workflow:', error);
      }
    }
  };

  const getIcon = () => {
    // Check for custom icon first (only for promptTemplate nodes)
    if (node.type === 'promptTemplate' && node.config.customIcon && iconRegistry[node.config.customIcon]) {
      return iconRegistry[node.config.customIcon];
    }
    
    switch (node.type) {
      case 'promptTemplate':
        return MessageSquare;
      case 'promptPiece':
        return Puzzle;
      case 'ingest':
        return Download;
      case 'dataset':
        return Database;
      case 'variable':
        return Variable;
      case 'framework':
        return Book;
      case 'agent':
        return Bot;
      case 'workflow':
        return Network;
      case 'integration':
        return Plug;
      default:
        return MessageSquare;
    }
  };

  const getModelDisplayName = (modelValue: string) => {
    const modelMap: Record<string, string> = {
      'google/gemini-3-flash-preview': 'Gemini 3 Flash',
      'google/gemini-3-pro-preview': 'Gemini 3 Pro',
      'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
      'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
      'google/gemini-2.5-flash-lite': 'Gemini 2.5 Lite',
      'openai/gpt-5.2': 'GPT-5.2',
      'openai/gpt-5': 'GPT-5',
      'openai/gpt-5-mini': 'GPT-5 Mini',
      'openai/gpt-5-nano': 'GPT-5 Nano',
      // Legacy fallbacks
      'openai-gpt-4o': 'OpenAI (legacy)',
      'claude-3.5': 'Claude (legacy)',
      'sonar': 'Sonar (legacy)',
      'local-vllm': 'Local (legacy)',
    };
    return modelMap[modelValue] || modelValue;
  };

  const truncateText = (text: string, maxLength: number): string => {
    if (!text || text.length <= maxLength) return text || '';
    return text.slice(0, maxLength).trim() + '...';
  };

  const Icon = getIcon();
  const hasErrors = node.errors && node.errors.length > 0;
  const isPaused = node.config?.paused === true;

  return (
    <div
      className={cn(
        "bg-background border rounded-lg shadow-md min-w-[200px] transition-all relative",
        selected ? "border-primary shadow-lg" : "border-node-border",
        hasErrors && "border-destructive",
        isPaused && "opacity-60 border-dashed"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className={cn(
          "w-3 h-3 !bg-gray-300 transition-opacity",
          isHandleConnected('top') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        id="top"
      />

      <Handle
        type="target"
        position={Position.Left}
        className={cn(
          "w-3 h-3 !bg-gray-300 transition-opacity",
          isHandleConnected('left') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        id="left"
      />

      <div className="p-3 relative group z-10">
        {node.type === 'workflow' && node.config.workflowId && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            onClick={handleNavigateToWorkflow}
          >
            <ArrowRight className="h-3 w-3" />
          </Button>
        )}
        
        <div className="flex items-start gap-2">
          {node.type === 'promptTemplate' ? (
            <IconPickerPopover
              currentIcon={node.config.customIcon || 'MessageSquare'}
              onSelect={(iconName) => updateNodeConfig(node.id, { customIcon: iconName })}
              trigger={
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 relative cursor-pointer hover:bg-primary/20 transition-colors">
                  <Icon className="w-4 h-4 text-primary" />
                  {isPaused && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                      <Pause className="w-2.5 h-2.5 text-white" />
                    </div>
                  )}
                </div>
              }
            />
          ) : (
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 relative">
              <Icon className="w-4 h-4 text-primary" />
              {isPaused && (
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center">
                  <Pause className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm text-foreground truncate">
                {node.label}
              </h3>
              {hasErrors && (
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {node.type === 'promptTemplate' && node.config.description && 
                truncateText(node.config.description, 30)
              }
              {node.type === 'promptPiece' && 'Text content'}
              {node.type === 'ingest' && 'Data ingest point'}
              {node.type === 'dataset' && 'Data reference'}
              {node.type === 'variable' && `${node.config.type || 'string'}`}
              {node.type === 'framework' && (node.config.name || node.config.type || 'Select framework')}
              {node.type === 'agent' && (
                (() => {
                  // Resolve mode from new mode field or legacy schema_only
                  const mode = node.config.ssotConfig?.mode || (node.config.ssotConfig?.schema_only ? 'schema' : 'data');
                  const sourceLabel = node.config.sourceNodeLabel;
                  if (sourceLabel) {
                    return mode === 'schema' 
                      ? `Schema → ${sourceLabel}` 
                      : `Data → ${sourceLabel}`;
                  }
                  return 'Configure mapping...';
                })()
              )}
              {node.type === 'workflow' && (node.config.workflowName || 'Select workflow')}
              {node.type === 'integration' && (
                node.config.capability 
                  ? `${node.config.integrationName}: ${node.config.capability}`
                  : (node.config.integrationName || 'Select integration')
              )}
            </p>
            {node.config.name && node.type === 'variable' && (
              <p className="text-xs text-primary mt-0.5">${node.config.name}</p>
            )}
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className={cn(
          "w-3 h-3 !bg-gray-300 transition-opacity",
          isHandleConnected('right') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        id="right"
      />

      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(
          "w-3 h-3 !bg-gray-300 transition-opacity",
          isHandleConnected('bottom') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        )}
        id="bottom"
      />

      {/* Status indicator light - bottom right (only show when no cascade active, overlay handles cascade status) */}
      {!cascadeProgress && (
        <div 
          className="absolute bottom-2 right-2 w-2.5 h-2.5 rounded-full bg-gray-300 z-10"
          title="Idle"
        />
      )}

      {/* Action buttons - appear when node is selected */}
      {selected && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1">
          <Button
            variant="secondary"
            size="icon"
            className="h-6 w-6 rounded-full shadow-md"
            onClick={handleDuplicate}
            title="Duplicate"
          >
            <Copy className="h-3 w-3" />
          </Button>
          {node.type === 'ingest' && selectedCompanyId && (
            <Button
              variant="secondary"
              size="icon"
              className="h-6 w-6 rounded-full shadow-md"
              onClick={async (e) => {
                e.stopPropagation();
                if (!selectedCompanyId) { toast.error('Please select a company first'); return; }
                toast.info('System cascade triggered — executing across all workflows...');
                setIsRunningSystem(true);
                const result = await runSystemWorkflows(node.id);
                setIsRunningSystem(false);
                if (result.success) {
                  toast.success(result.message);
                } else {
                  toast.error(result.message);
                }
              }}
              disabled={isRunningSystem || isSystemRunning || isForceRunning}
              title="Run All Downstream (Cross-Workflow)"
            >
              {isRunningSystem || isSystemRunning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Globe className="h-3 w-3 text-blue-500" />
              )}
            </Button>
          )}
          {supportsForceRun && selectedCompanyId && (
            <Button
              variant="secondary"
              size="icon"
              className="h-6 w-6 rounded-full shadow-md"
              onClick={handleForceRun}
              disabled={isRunningThisNode || isForceRunning}
              title="Force Run + Downstream"
            >
              {isRunningThisNode ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3 text-amber-500" />
              )}
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            className="h-6 w-6 rounded-full shadow-md"
            onClick={handleDelete}
            title="Delete"
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      )}
    </div>
  );
}
