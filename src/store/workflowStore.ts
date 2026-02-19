import { create } from 'zustand';
import { Workflow, NodeBase, Edge, VariableDef, NodeImprovementData, NodePerformanceData, WorkflowHierarchyItem, WorkflowLoadedIdentity } from '@/types/workflow';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getModelById, MODEL_REGISTRY } from '@/lib/modelRegistry';

export interface NodePreviewData {
  output: any;
  executedAt: string | null;
  isLoading: boolean;
  cached: boolean;
  error?: string;
}

// Cascade progress tracking
export interface CascadeProgress {
  current: number;
  total: number;
  currentNodeId: string | null;
  currentNodeLabel: string | null;
  currentWorkflowName: string | null;
  executingNodeIds: string[];
  completedNodeIds: string[];
  failedNodeId: string | null;
  error: string | null;
  submissionId: string | null;
}

// Non-executable node types (decorative canvas elements)
const NON_EXECUTABLE_TYPES = new Set(['note', 'divider', 'shape', 'floatingEndpoint']);

interface WorkflowState {
  workflow: Workflow;
  selectedNodeIds: string[];
  lastSelectedNodeType: string | null;  // Track for tab preservation across selection changes
  validationErrors: string[];
  isLoading: boolean;
  currentLayer: 'framework' | 'improvement' | 'performance';
  improvementData: Map<string, NodeImprovementData>;
  performanceData: Map<string, NodePerformanceData>;
  isAIConversationOpen: boolean;
  nodePreviewData: Map<string, NodePreviewData>;
  isTestRunning: boolean;
  isForceRunning: boolean;
  isSystemRunning: boolean;
  cascadeProgress: CascadeProgress | null;  // Track cascade execution progress
  isInspectorOpen: boolean;
  inspectorTab: 'inspector' | 'prompt-builder' | 'preview' | 'loading';
  // Company selection state
  selectedCompanyId: string | null;
  selectedCompanyName: string | null;
  companies: Array<{ id: string; name: string; slug: string }>;
  // Navigation lock for critical multi-step operations
  isNavigationLocked: boolean;
  // Cancellation mechanism for running cascades
  cancelledCascadeIds: Set<string>;
  
  // Actions
  addNode: (node: NodeBase) => void;
  updateNode: (nodeId: string, updates: Partial<NodeBase>) => void;
  deleteNode: (nodeId: string) => void;
  addEdge: (edge: Edge) => void;
  deleteEdge: (edgeId: string) => void;
  setSelectedNodes: (nodeIds: string[]) => void;
  setInspectorOpen: (isOpen: boolean) => void;
  setInspectorTab: (tab: 'inspector' | 'prompt-builder' | 'preview' | 'loading') => void;
  loadPerformanceData: (workflowId: string, companyId?: string) => Promise<void>;
  loadImprovementData: (workflowId: string, companyId?: string) => Promise<void>;
  toggleSelection: (nodeId: string) => void;
  clearSelection: () => void;
  deleteSelectedNodes: () => void;
  updateNodeConfig: (nodeId: string, config: Record<string, any>) => void;
  addVariable: (variable: VariableDef) => void;
  updateVariable: (name: string, updates: Partial<VariableDef>) => void;
  deleteVariable: (name: string) => void;
  setValidationErrors: (errors: string[]) => void;
  saveWorkflow: (options?: { silent?: boolean; source?: 'user' | 'autosave' }) => Promise<void>;
  loadWorkflow: (workflow: Workflow) => void;
  loadWorkflows: () => Promise<Workflow[]>;
  initializeWorkflow: () => Promise<void>;
  markUnsaved: () => void;
  createNewWorkflow: () => void;
  setCurrentLayer: (layer: 'framework' | 'improvement' | 'performance') => void;
  generateMockImprovementData: (nodeId: string) => void;
  updateImprovementData: (nodeId: string, data: NodeImprovementData) => void;
  getImprovementDataForNode: (nodeId: string) => NodeImprovementData | undefined;
  generateMockPerformanceData: (nodeId: string) => void;
  updatePerformanceData: (nodeId: string, data: NodePerformanceData) => void;
  getPerformanceDataForNode: (nodeId: string) => NodePerformanceData | undefined;
  reorderWorkflow: (workflowId: string, targetWorkflowId: string) => Promise<void>;
  indentWorkflow: (workflowId: string) => Promise<void>;
  outdentWorkflow: (workflowId: string) => Promise<void>;
  moveWorkflowUp: (workflowId: string) => Promise<void>;
  moveWorkflowDown: (workflowId: string) => Promise<void>;
  toggleWorkflowExpanded: (workflowId: string) => Promise<void>;
  getWorkflowHierarchy: (workflows: Workflow[]) => WorkflowHierarchyItem[];
  toggleAIConversation: () => void;
  // Company actions
  setSelectedCompany: (companyId: string, companyName: string) => void;
  loadCompanies: () => Promise<void>;
  // Node preview/testing actions
  loadNodePreview: (nodeId: string) => Promise<void>;
  runTestNodes: (nodeIds: string[]) => Promise<void>;
  setNodePreviewLoading: (nodeId: string, isLoading: boolean) => void;
  duplicateNode: (nodeId: string) => void;
  deleteWorkflow: (workflowId: string) => Promise<boolean>;
  forceRunWorkflow: () => Promise<{ success: boolean; message: string }>;
  forceRunNode: (nodeId: string) => Promise<{ success: boolean; message: string }>;
  // New cascade orchestration
  forceRunCascade: (startNodeId?: string) => Promise<{ success: boolean; message: string }>;
  executeSingleNode: (nodeId: string, workflowIdOverride?: string) => Promise<{ success: boolean; output?: any; nextNodes: string[]; error?: string }>;
  // Cross-workflow system trigger with client-side orchestration
  runSystemWorkflows: (triggerNodeId?: string) => Promise<{ success: boolean; message: string }>;
  // Sync shared caches without re-running nodes
  syncSharedCaches: (sharedCacheIds?: string[]) => Promise<{ success: boolean; message: string }>;
  // Navigation lock controls
  lockNavigation: () => void;
  unlockNavigation: () => void;
  // Cancel a running cascade by submission ID
  cancelCascade: (submissionId: string) => void;
  // Direct save without triggering loadWorkflow (for MoveToCanvasDialog)
  saveWorkflowDirect: (workflowData: Partial<Workflow> & { id: string }) => Promise<{ success: boolean; error?: string }>;
  // Safe metadata update - updates name/settings WITHOUT triggering loadWorkflow's beacon save
  updateWorkflowMetadata: (updates: Partial<Pick<Workflow, 'name' | 'settings' | 'parent_id'>>) => void;
}

const initialWorkflow: Workflow = {
  id: '1',
  name: 'New Workflow',
  nodes: [],
  edges: [],
  variables: [],
  version: 1,
  unsavedChanges: false,
  // Identity for initial state - prevents "no identity" warnings during early saves
  _loadedIdentity: {
    id: '1',
    name: 'New Workflow',
    token: 'initial-workflow-token',
    loadedAt: Date.now(),
  },
};

// Note: saveTransactionId and save mutex are NO LONGER USED
// All saves now go through useAutoSave hook with proper await before navigation
// These are kept temporarily for backward compatibility but can be removed

// Migration helper to fix old handle IDs
const migrateEdgeHandles = (edges: Edge[]): Edge[] => {
  return edges.map(edge => ({
    ...edge,
    from: {
      ...edge.from,
      port: edge.from.port === 'out' ? 'bottom' : 
            edge.from.port === 'in' ? 'top' : 
            // Convert 'source-*' to simple '*' for floating endpoint compatibility
            edge.from.port?.replace('source-', '') || edge.from.port
    },
    to: {
      ...edge.to,
      port: edge.to.port === 'out' ? 'bottom' : 
            edge.to.port === 'in' ? 'top' : 
            // Convert 'source-*' to simple '*' for floating endpoint compatibility
            edge.to.port?.replace('source-', '') || edge.to.port
    }
  }));
};

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflow: initialWorkflow,
  selectedNodeIds: [],
  lastSelectedNodeType: null,
  validationErrors: [],
  isLoading: false,
  currentLayer: 'framework',
  improvementData: new Map(),
  performanceData: new Map(),
  isAIConversationOpen: false,
  nodePreviewData: new Map(),
  isTestRunning: false,
  isForceRunning: false,
  isSystemRunning: false,
  cascadeProgress: null,
  isInspectorOpen: true,
  inspectorTab: 'inspector',
  // Company selection state
  selectedCompanyId: null,
  selectedCompanyName: null,
  companies: [],
  // Navigation lock for critical multi-step operations
  isNavigationLocked: false,
  cancelledCascadeIds: new Set(),

  addNode: (node) => {
    // Add default config for promptTemplate nodes
    if (node.type === 'promptTemplate' && (!node.config || Object.keys(node.config).length === 0)) {
      node.config = {
        name: '',
        model: 'google/gemini-3-flash-preview',
        system_prompt: '',
        temperature: 0.7,
        max_tokens: 8000,
        outputName: '',
        description: '',
        dependencies: []
      };
    }

    // Add default config for ingest nodes
    if (node.type === 'ingest' && (!node.config || Object.keys(node.config).length === 0)) {
      node.config = {
        sourceType: 'integration',
        integrationId: 'abivc',
        integrationName: 'AbiVC',
        ingestPointId: 'initial_submission',
        ingestPointName: 'Initial Submission',
        source: 'company_ingest', // For backward compatibility
      };
    }

    // Add default config for variable nodes
    if (node.type === 'variable' && (!node.config || Object.keys(node.config).length === 0)) {
      node.config = {
        name: '',
        type: 'string',
        default: '',
        scope: 'global',
        outputName: '',
        dependencies: []
      };
    }

    // Add default config for framework nodes
    if (node.type === 'framework' && (!node.config || Object.keys(node.config).length === 0)) {
      node.config = {
        name: 'New Framework',
        description: '',
        schema: '{\n  "scale": "1-10",\n  "criteria": []\n}',
        type: 'rating_scale'
      };
    }
    
    // Add default config for note nodes
    if (node.type === 'note' && (!node.config || Object.keys(node.config).length === 0)) {
      node.config = {
        text: 'New Note',
        fontSize: 'medium',
        color: '#6366f1'
      };
    }

    // Add default config for divider nodes
    if (node.type === 'divider' && (!node.config || Object.keys(node.config).length === 0)) {
      node.config = {
        orientation: 'horizontal',
        length: 200,
        strokeWidth: 2,
        color: '#94a3b8',
        style: 'solid',
      };
    }

    // Add default config for shape nodes
    if (node.type === 'shape' && (!node.config || Object.keys(node.config).length === 0)) {
      node.config = {
        width: 300,
        height: 200,
        borderWidth: 2,
        borderColor: '#94a3b8',
        borderStyle: 'dashed',
        borderRadius: 8,
        backgroundColor: 'transparent',
      };
    }

    // Add default config for floatingEndpoint nodes
    if (node.type === 'floatingEndpoint' && (!node.config || Object.keys(node.config).length === 0)) {
      node.config = {};
    }

    // Add default config for workflow nodes
    if (node.type === 'workflow' && (!node.config || Object.keys(node.config).length === 0)) {
      node.config = {
        workflowId: '',
        workflowName: '',
      };
    }

    // Add default config for ingest nodes
    if (node.type === 'ingest' && (!node.config || Object.keys(node.config).length === 0)) {
      node.config = {
        sourceType: 'company_submission',
        source: 'company_ingest', // For backward compatibility with execution engines
      };
    }
    
    // Apply state change - unified autosave will handle persistence
    set((state) => ({
      workflow: {
        ...state.workflow,
        nodes: [...state.workflow.nodes, node],
        unsavedChanges: true,
      }
    }));
  },

  updateNode: (nodeId, updates) => set((state) => ({
    workflow: {
      ...state.workflow,
      nodes: state.workflow.nodes.map(node => 
        node.id === nodeId ? { ...node, ...updates } : node
      ),
      unsavedChanges: true,
    }
  })),

  deleteNode: (nodeId) => {
    // Apply state change - unified autosave will handle persistence
    set((state) => ({
      workflow: {
        ...state.workflow,
        nodes: state.workflow.nodes.filter(node => node.id !== nodeId),
        edges: state.workflow.edges.filter(edge => 
          edge.from.node !== nodeId && edge.to.node !== nodeId
        ),
        unsavedChanges: true,
      },
      selectedNodeIds: state.selectedNodeIds.filter(id => id !== nodeId),
    }));
  },

  addEdge: (edge) => {
    // Apply state change - unified autosave will handle persistence
    set((state) => ({
      workflow: {
        ...state.workflow,
        edges: [...state.workflow.edges, edge],
        unsavedChanges: true,
      }
    }));
  },

  deleteEdge: (edgeId) => {
    // Apply state change - unified autosave will handle persistence
    set((state) => {
      const edgeToDelete = state.workflow.edges.find(e => e.id === edgeId);
      if (!edgeToDelete) return state;
      
      const newEdges = state.workflow.edges.filter(edge => edge.id !== edgeId);
      
      // Check if source or target are floating endpoints that will become orphaned
      const orphanedNodeIds: string[] = [];
      
      [edgeToDelete.from.node, edgeToDelete.to.node].forEach(nodeId => {
        const node = state.workflow.nodes.find(n => n.id === nodeId);
        if (node?.type === 'floatingEndpoint') {
          // Check if this node has any OTHER edges after deletion
          const hasOtherEdges = newEdges.some(
            e => e.from.node === nodeId || e.to.node === nodeId
          );
          if (!hasOtherEdges) {
            orphanedNodeIds.push(nodeId);
          }
        }
      });
      
      return {
        workflow: {
          ...state.workflow,
          edges: newEdges,
          nodes: state.workflow.nodes.filter(n => !orphanedNodeIds.includes(n.id)),
          unsavedChanges: true,
        }
      };
    });
  },

  setSelectedNodes: (nodeIds) => set((state) => {
    if (nodeIds.length === 0) {
      return { selectedNodeIds: nodeIds };
    }
    
    // Get the new node
    const newNode = nodeIds.length === 1 
      ? state.workflow.nodes.find(n => n.id === nodeIds[0])
      : undefined;
    
    // Compare with stored previous type (survives clearSelection calls during React Flow transitions)
    const sameType = state.lastSelectedNodeType && newNode && 
      state.lastSelectedNodeType === newNode.type;
    
    // Check if current tab is valid for the new node type
    const visualOnlyTypes = ['note', 'shape', 'divider', 'floatingEndpoint'];
    const isVisualOnly = newNode && visualOnlyTypes.includes(newNode.type);
    const isPromptTemplate = newNode?.type === 'promptTemplate';
    
    let newTab = state.inspectorTab;
    
    if (!sameType) {
      // Different types - reset to inspector
      newTab = 'inspector';
    } else {
      // Same type - validate current tab is still valid
      if (newTab === 'prompt-builder' && !isPromptTemplate) {
        newTab = 'inspector';
      }
      if ((newTab === 'preview' || newTab === 'loading') && isVisualOnly) {
        newTab = 'inspector';
      }
    }
    
    return {
      selectedNodeIds: nodeIds,
      isInspectorOpen: true,
      inspectorTab: newTab,
      // Store this node's type for next comparison
      lastSelectedNodeType: newNode?.type || null,
    };
  }),

  setInspectorOpen: (isOpen) => set({ isInspectorOpen: isOpen }),
  
  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  toggleSelection: (nodeId) => set((state) => ({
    selectedNodeIds: state.selectedNodeIds.includes(nodeId)
      ? state.selectedNodeIds.filter(id => id !== nodeId)
      : [...state.selectedNodeIds, nodeId]
  })),

  clearSelection: () => set({ selectedNodeIds: [] }),

  deleteSelectedNodes: () => {
    // Apply state change - unified autosave will handle persistence
    set((state) => {
      const selectedIds = new Set(state.selectedNodeIds);
      return {
        workflow: {
          ...state.workflow,
          nodes: state.workflow.nodes.filter(node => !selectedIds.has(node.id)),
          edges: state.workflow.edges.filter(edge => 
            !selectedIds.has(edge.from.node) && !selectedIds.has(edge.to.node)
          ),
          unsavedChanges: true,
        },
        selectedNodeIds: []
      };
    });
  },

  duplicateNode: (nodeId) => {
    const state = get();
    const nodeToDuplicate = state.workflow.nodes.find(n => n.id === nodeId);
    
    if (!nodeToDuplicate) return;
    
    const newNode: NodeBase = {
      ...nodeToDuplicate,
      id: `${nodeToDuplicate.type}-${Date.now()}`,
      label: `${nodeToDuplicate.label} (Copy)`,
      position: {
        x: nodeToDuplicate.position.x + 50,
        y: nodeToDuplicate.position.y + 50,
      },
      config: { ...nodeToDuplicate.config },
      ports: [...nodeToDuplicate.ports],
      errors: undefined,
    };
    
    // Apply state change - unified autosave will handle persistence
    set((state) => ({
      workflow: {
        ...state.workflow,
        nodes: [...state.workflow.nodes, newNode],
        unsavedChanges: true,
      },
      selectedNodeIds: [newNode.id],
    }));
  },

  updateNodeConfig: (nodeId, config) => set((state) => ({
    workflow: {
      ...state.workflow,
      nodes: state.workflow.nodes.map(node =>
        node.id === nodeId ? { ...node, config: { ...node.config, ...config } } : node
      ),
      unsavedChanges: true,
    }
  })),

  addVariable: (variable) => set((state) => ({
    workflow: {
      ...state.workflow,
      variables: [...state.workflow.variables, variable],
      unsavedChanges: true,
    }
  })),

  updateVariable: (name, updates) => set((state) => ({
    workflow: {
      ...state.workflow,
      variables: state.workflow.variables.map(v =>
        v.name === name ? { ...v, ...updates } : v
      ),
      unsavedChanges: true,
    }
  })),

  deleteVariable: (name) => set((state) => ({
    workflow: {
      ...state.workflow,
      variables: state.workflow.variables.filter(v => v.name !== name),
      unsavedChanges: true,
    }
  })),

  setValidationErrors: (errors) => set({ validationErrors: errors }),

  // Delegate to event-driven save system
  saveWorkflow: async (_options?: { silent?: boolean; source?: 'user' | 'autosave' }) => {
    const { saveCurrentWorkflow } = await import('@/hooks/useSaveOnEvent');
    await saveCurrentWorkflow();
  },

  loadWorkflow: (newWorkflow) => {
    const currentState = get();
    
    // CRITICAL: Block navigation during critical operations
    if (currentState.isNavigationLocked) {
      console.warn('[loadWorkflow] Navigation blocked: critical operation in progress');
      return;
    }
    
    // CRITICAL: Validate that newWorkflow has a valid ID
    if (!newWorkflow || !newWorkflow.id) {
      console.error('[loadWorkflow] Invalid workflow - missing ID');
      return;
    }
    
    // If loading the same workflow, update in place (preserve identity)
    if (currentState.workflow.id === newWorkflow.id) {
      console.log('[loadWorkflow] Same workflow ID - updating in place');
      const migratedWorkflow = {
        ...newWorkflow,
        edges: migrateEdgeHandles(newWorkflow.edges),
        unsavedChanges: false,
        _loadedIdentity: currentState.workflow._loadedIdentity,
      };
      set({ workflow: migratedWorkflow });
      return;
    }
    
    // SIMPLIFIED: No beacon save here - flushSave() is called BEFORE loadWorkflow
    // by the UI components (Header.tsx, WorkflowHeader.tsx)
    
    // Generate NEW identity fingerprint for incoming workflow
    const newIdentity: WorkflowLoadedIdentity = {
      id: newWorkflow.id,
      name: newWorkflow.name,
      token: crypto.randomUUID(),
      loadedAt: Date.now(),
    };
    
    const migratedWorkflow = {
      ...newWorkflow,
      edges: migrateEdgeHandles(newWorkflow.edges),
      unsavedChanges: false,
      _loadedIdentity: newIdentity,
    };
    
    console.log(`[loadWorkflow] Loaded: ID=${newIdentity.id}, Name="${newIdentity.name}"`);
    
    set({ workflow: migratedWorkflow });
    localStorage.setItem('currentWorkflowId', newWorkflow.id);
  },

  loadWorkflows: async () => {
    try {
      const response = await supabase.functions.invoke('load-workflows');

      if (response.error) throw response.error;

      return response.data || [];
    } catch (error) {
      console.error('Error loading workflows:', error);
      toast.error('Failed to load workflows');
      return [];
    }
  },

  initializeWorkflow: async () => {
    set({ isLoading: true });
    try {
      // Check for unfinished backup before loading workflows
      const { checkForBackupRecovery } = await import('@/hooks/useSaveOnEvent');
      checkForBackupRecovery();

      const savedWorkflowId = localStorage.getItem('currentWorkflowId');
      const workflows = await get().loadWorkflows();

      if (workflows.length === 0) {
        // No saved workflows, start with initial workflow
        set({ isLoading: false });
        return;
      }

      // Try to load the previously viewed workflow
      let workflowToLoad = workflows.find(w => w.id === savedWorkflowId);
      
      // If not found, load the most recent one
      if (!workflowToLoad) {
        workflowToLoad = workflows[0];
      }

      if (workflowToLoad) {
        // Migration is handled in loadWorkflow
        get().loadWorkflow(workflowToLoad);
      }
    } catch (error) {
      console.error('Error initializing workflow:', error);
      toast.error('Failed to load saved workflow');
    } finally {
      set({ isLoading: false });
    }
  },

  markUnsaved: () => set((state) => ({
    workflow: { ...state.workflow, unsavedChanges: true }
  })),

  createNewWorkflow: () => {
    const newId = 'temp-' + Date.now();
    const newWorkflow: Workflow = {
      id: newId,
      name: 'Untitled Canvas',
      nodes: [],
      edges: [],
      variables: [],
      version: 1,
      unsavedChanges: true,
      // Generate identity for new workflows to enable immediate saves
      _loadedIdentity: {
        id: newId,
        name: 'Untitled Canvas',
        token: crypto.randomUUID(),
        loadedAt: Date.now(),
      },
    };
    set({ 
      workflow: newWorkflow,
      selectedNodeIds: [],
      validationErrors: []
    });
    localStorage.removeItem('currentWorkflowId');
  },

  setCurrentLayer: (layer) => {
    set({ currentLayer: layer });
    
    // Load real performance data when switching to performance layer
    if (layer === 'performance') {
      const state = get();
      if (state.workflow.id && state.workflow.id !== '1' && !state.workflow.id.startsWith('temp-')) {
        get().loadPerformanceData(state.workflow.id, state.selectedCompanyId || undefined);
      }
    }
    
    // Load real improvement data when switching to improvement layer
    if (layer === 'improvement') {
      const state = get();
      if (state.workflow.id && state.workflow.id !== '1' && !state.workflow.id.startsWith('temp-')) {
        get().loadImprovementData(state.workflow.id, state.selectedCompanyId || undefined);
      }
    }
  },

  loadImprovementData: async (workflowId: string, companyId?: string) => {
    try {
      // First, get the evaluation limit from settings
      const { data: settingsData } = await supabase
        .from('app_settings')
        .select('node_palette_customizations')
        .limit(1)
        .maybeSingle();

      const customizations = (settingsData?.node_palette_customizations || {}) as Record<string, any>;
      const evaluationLimit = customizations._self_improvement?.evaluation_limit || 20;

      // Fetch evaluations from evaluation_history for aggregation
      let historyQuery = supabase
        .from('evaluation_history')
        .select('node_id, hallucination_score, hallucination_reasoning, data_quality_score, data_quality_reasoning, complexity_score, complexity_reasoning, overall_score, evaluated_at, flags')
        .eq('workflow_id', workflowId)
        .order('evaluated_at', { ascending: false })
        .limit(evaluationLimit * 10); // Fetch more to aggregate per node

      if (companyId) {
        historyQuery = historyQuery.eq('company_id', companyId);
      }

      const { data: historyData, error: historyError } = await historyQuery;

      if (historyError) {
        console.error('Error loading evaluation history:', historyError);
      }

      // Group evaluations by node_id and calculate averages
      const nodeEvaluations = new Map<string, typeof historyData>();
      historyData?.forEach((eval_row) => {
        if (!eval_row.node_id) return;
        if (!nodeEvaluations.has(eval_row.node_id)) {
          nodeEvaluations.set(eval_row.node_id, []);
        }
        const nodeEvals = nodeEvaluations.get(eval_row.node_id)!;
        if (nodeEvals.length < evaluationLimit) {
          nodeEvals.push(eval_row);
        }
      });

      // Calculate aggregated scores per node
      nodeEvaluations.forEach((evals, nodeId) => {
        if (evals.length === 0) return;

        const avgHallucination = Math.round(
          evals.filter(e => e.hallucination_score !== null).reduce((sum, e) => sum + (e.hallucination_score || 0), 0) / 
          Math.max(1, evals.filter(e => e.hallucination_score !== null).length)
        );
        const avgDataQuality = Math.round(
          evals.filter(e => e.data_quality_score !== null).reduce((sum, e) => sum + (e.data_quality_score || 0), 0) / 
          Math.max(1, evals.filter(e => e.data_quality_score !== null).length)
        );
        const avgComplexity = Math.round(
          evals.filter(e => e.complexity_score !== null).reduce((sum, e) => sum + (e.complexity_score || 0), 0) / 
          Math.max(1, evals.filter(e => e.complexity_score !== null).length)
        );

        const overallScore = Math.round(avgHallucination * 0.5 + avgDataQuality * 0.3 + avgComplexity * 0.2);
        const latestEval = evals[0]; // Most recent

        const improvementData: NodeImprovementData = {
          nodeId,
          hallucinationScore: avgHallucination,
          hallucinationReasoning: latestEval?.hallucination_reasoning || undefined,
          dataQualityScore: avgDataQuality,
          dataQualityReasoning: latestEval?.data_quality_reasoning || undefined,
          complexityScore: avgComplexity,
          complexityReasoning: latestEval?.complexity_reasoning || undefined,
          overallScore,
          evaluatedAt: latestEval?.evaluated_at || undefined,
          flags: latestEval?.flags || undefined,
          // Legacy mapping
          hallucinations: avgHallucination,
          accuracy: avgHallucination,
          grading: avgDataQuality,
          heatmapScore: overallScore,
        };

        get().updateImprovementData(nodeId, improvementData);
      });

      // Fallback: Also check company_node_data for nodes not in evaluation_history
      let query = supabase
        .from('company_node_data')
        .select('node_id, data')
        .eq('workflow_id', workflowId);
      
      if (companyId) {
        query = query.eq('company_id', companyId);
      }
      
      const { data, error } = await query;
      
      if (error || !data) {
        console.error('Error loading improvement data:', error);
        return;
      }
      
      // Only process nodes that don't have evaluation_history data
      data.forEach((row: any) => {
        if (nodeEvaluations.has(row.node_id)) return; // Skip if we have history data
        
        const evaluation = row.data?.evaluation;
        if (!evaluation) return;
        
        const improvementData: NodeImprovementData = {
          nodeId: row.node_id,
          hallucinationScore: evaluation.hallucination?.score,
          hallucinationReasoning: evaluation.hallucination?.reasoning,
          dataQualityScore: evaluation.dataQuality?.score,
          dataQualityReasoning: evaluation.dataQuality?.reasoning,
          complexityScore: evaluation.complexity?.score,
          complexityReasoning: evaluation.complexity?.reasoning,
          overallScore: evaluation.overallScore,
          evaluatedAt: evaluation.evaluatedAt,
          flags: row.data?.flags,
          // Legacy mapping
          hallucinations: evaluation.hallucination?.score,
          accuracy: evaluation.hallucination?.score,
          grading: evaluation.dataQuality?.score,
          heatmapScore: evaluation.overallScore,
        };
        
        get().updateImprovementData(row.node_id, improvementData);
      });
    } catch (error) {
      console.error('Error loading improvement data:', error);
    }
  },

  generateMockImprovementData: (nodeId) => {
    // No longer generating mock data - real data comes from loadImprovementData
    console.log('Mock improvement data generation disabled - use loadImprovementData instead');
  },

  updateImprovementData: (nodeId, data) => set((state) => {
    const newMap = new Map(state.improvementData);
    newMap.set(nodeId, data);
    return { improvementData: newMap };
  }),

  getImprovementDataForNode: (nodeId) => {
    return get().improvementData.get(nodeId);
  },

  generateMockPerformanceData: (nodeId) => {
    // No longer generating mock data - real data comes from loadPerformanceData
    console.log('Mock performance data generation disabled - use loadPerformanceData instead');
  },

  updatePerformanceData: (nodeId, data) => set((state) => {
    const newMap = new Map(state.performanceData);
    newMap.set(nodeId, data);
    return { performanceData: newMap };
  }),

  loadPerformanceData: async (workflowId: string, companyId?: string) => {
    try {
      // Build query
      let query = supabase
        .from('ai_usage_logs')
        .select('node_id, model, prompt_tokens, completion_tokens, total_tokens, estimated_cost, execution_time_ms, created_at, usage_category')
        .eq('workflow_id', workflowId)
        .order('created_at', { ascending: false })
        .limit(1000);
      
      if (companyId) {
        query = query.eq('company_id', companyId);
      }
      
      const { data, error } = await query;
      
      if (error || !data || data.length === 0) return;
      
      // Group logs by node_id
      const logsByNode = new Map<string, typeof data>();
      data.forEach(log => {
        if (!log.node_id) return;
        if (!logsByNode.has(log.node_id)) {
          logsByNode.set(log.node_id, []);
        }
        logsByNode.get(log.node_id)!.push(log);
      });
      
      const state = get();
      
      // Calculate metrics for each node
      for (const [nodeId, logs] of logsByNode) {
        const node = state.workflow.nodes.find(n => n.id === nodeId);
        const configuredModel = node?.config?.model || 'google/gemini-3-flash-preview';
        const modelInfo = getModelById(configuredModel);
        const maxOutputTokens = modelInfo?.maxOutputTokens || 16384;
        
        // Token analysis
        const totalTokens = logs.map(l => l.total_tokens || 0);
        const avgTokens = totalTokens.length > 0 
          ? Math.round(totalTokens.reduce((a, b) => a + b, 0) / totalTokens.length)
          : 0;
        
        const promptTokens = logs.map(l => l.prompt_tokens || 0);
        const avgPromptTokens = promptTokens.length > 0 
          ? Math.round(promptTokens.reduce((a, b) => a + b, 0) / promptTokens.length)
          : 0;
        
        const outputTokens = logs.map(l => l.completion_tokens || 0);
        const avgOutputTokens = outputTokens.length > 0 
          ? Math.round(outputTokens.reduce((a, b) => a + b, 0) / outputTokens.length)
          : 0;
        const maxOutputSeen = Math.max(...outputTokens, 0);
        const thresholdPercent = Math.round((avgOutputTokens / maxOutputTokens) * 100);
        const atMaxCount = outputTokens.filter(t => t >= maxOutputTokens * 0.95).length;
        
        // Speed analysis
        const speeds = logs.map(l => l.execution_time_ms).filter((s): s is number => s !== null && s !== undefined);
        const avgSpeedMs = speeds.length > 0 
          ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
          : undefined;
        const maxSpeedMs = speeds.length > 0 ? Math.max(...speeds) : undefined;
        const minSpeedMs = speeds.length > 0 ? Math.min(...speeds) : undefined;
        
        // Speed scoring (0-100, higher is better: <1s = 70-100, 1-3s = 40-70, >3s = 0-40)
        let speedScore = 50; // Default when no data
        if (avgSpeedMs !== undefined) {
          if (avgSpeedMs < 1000) {
            speedScore = 100 - Math.round((avgSpeedMs / 1000) * 30); // Fast = high score
          } else if (avgSpeedMs < 3000) {
            speedScore = 70 - Math.round(((avgSpeedMs - 1000) / 2000) * 30);
          } else {
            speedScore = Math.max(0, 40 - Math.round(((avgSpeedMs - 3000) / 5000) * 40));
          }
        }
        
        // Cost analysis
        const costs = logs.map(l => Number(l.estimated_cost) || 0);
        const avgCost = costs.length > 0 
          ? costs.reduce((a, b) => a + b, 0) / costs.length
          : 0;
        const totalCost = costs.reduce((a, b) => a + b, 0);
        
        // Cost scoring (0-100, higher is better: low cost = high score)
        const costScore = Math.max(0, 100 - Math.min(100, Math.round((avgCost / 0.01) * 100)));
        
        // Token threshold scoring (invert: low usage = good = high score)
        const tokenScore = Math.max(0, 100 - thresholdPercent);
        
        // Overall score: weighted average (now higher is better)
        const overallScore = Math.round(
          (tokenScore * 0.4) + (speedScore * 0.3) + (costScore * 0.3)
        );
        
        // Generate suggestions (now checking for LOW scores since higher is better)
        const suggestions: string[] = [];
        if (atMaxCount > 0) {
          suggestions.push(`${atMaxCount} generations hit max tokens - consider increasing max_tokens or using a model with higher limits`);
        }
        if (avgSpeedMs && avgSpeedMs > 3000) {
          suggestions.push('Average response time is slow - consider using a faster model variant');
        }
        if (costScore < 40) {
          suggestions.push('High cost per generation - consider using a more cost-effective model');
        }
        
        // Filter to only generation logs for model comparison (exclude evaluation logs)
        const generationLogs = logs.filter(l => 
          !l.usage_category || l.usage_category === 'generation'
        );
        const lastExecutedModel = generationLogs[0]?.model;
        
        const perfData: NodePerformanceData = {
          nodeId,
          avgTokens,
          avgPromptTokens,
          avgOutputTokens,
          maxOutputTokensSeen: maxOutputSeen,
          thresholdPercent,
          atMaxCount,
          totalGenerations: logs.length,
          avgSpeedMs,
          maxSpeedMs,
          minSpeedMs,
          speedScore,
          avgCost,
          totalCost,
          costScore,
          configuredModel,
          lastExecutedModel,
          modelMismatch: lastExecutedModel !== configuredModel,
          modelThreshold: maxOutputTokens,
          overallScore,
          suggestions: suggestions.length > 0 ? suggestions : undefined,
        };
        
        get().updatePerformanceData(nodeId, perfData);
        
        // Create system alert for model mismatch
        if (lastExecutedModel && configuredModel && lastExecutedModel !== configuredModel) {
          try {
            await supabase.rpc('upsert_model_mismatch_alert', {
              _workflow_id: workflowId,
              _node_id: nodeId,
              _node_label: node?.label || nodeId,
              _configured_model: configuredModel,
              _executed_model: lastExecutedModel,
            });
            console.log(`[loadPerformanceData] Created mismatch alert for node ${nodeId}`);
          } catch (alertError) {
            console.error('[loadPerformanceData] Failed to create mismatch alert:', alertError);
          }
        }
      }
    } catch (error) {
      console.error('Error loading performance data:', error);
    }
  },

  getPerformanceDataForNode: (nodeId) => {
    return get().performanceData.get(nodeId);
  },

  reorderWorkflow: async (workflowId: string, targetWorkflowId: string) => {
    try {
      // Load all workflows to calculate new positions
      const allWorkflows = await get().loadWorkflows();
      
      const draggedWorkflow = allWorkflows.find(w => w.id === workflowId);
      const targetWorkflow = allWorkflows.find(w => w.id === targetWorkflowId);
      
      if (!draggedWorkflow || !targetWorkflow) return;
      
      // Only reorder at the same level (no nesting via drag)
      const newParentId = targetWorkflow.parent_id || null;
      
      // Get siblings at the target level (excluding the dragged item)
      const siblings = allWorkflows.filter(w => 
        (w.parent_id || null) === (newParentId || null) && w.id !== workflowId
      );
      
      siblings.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      
      // Find where to insert the dragged workflow
      const insertIndex = Math.max(0, siblings.findIndex(w => w.id === targetWorkflowId));
      
      // Build new siblings array with dragged workflow inserted
      const newSiblings = [...siblings];
      newSiblings.splice(insertIndex, 0, draggedWorkflow);
      
      // Recalculate sort_order for all items (0, 1, 2, 3...)
      const updates = newSiblings.map((workflow, index) => ({
        id: workflow.id,
        sort_order: index,
        parent_id: newParentId,
      }));
      
      // Update all workflows in the database
      for (const update of updates) {
        const { error } = await supabase
          .from('workflows')
          .update({
            parent_id: update.parent_id,
            sort_order: update.sort_order,
            updated_at: new Date().toISOString(),
          })
          .eq('id', update.id);
          
        if (error) throw error;
      }
      
    } catch (error) {
      console.error('Error reordering workflow:', error);
      toast.error('Failed to reorder workflow');
    }
  },

  indentWorkflow: async (workflowId: string) => {
    try {
      const allWorkflows = await get().loadWorkflows();
      const workflow = allWorkflows.find(w => w.id === workflowId);
      if (!workflow) return;
      
      // Find siblings at same level
      const siblings = allWorkflows
        .filter(w => (w.parent_id || null) === (workflow.parent_id || null))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      
      const currentIndex = siblings.findIndex(w => w.id === workflowId);
      
      // Can only indent if there's a previous sibling
      if (currentIndex <= 0) return;
      
      const newParent = siblings[currentIndex - 1];
      
      // Get new parent's children to calculate sort_order
      const newSiblings = allWorkflows.filter(w => w.parent_id === newParent.id);
      const newSortOrder = newSiblings.length; // Append to end
      
      const { error } = await supabase
        .from('workflows')
        .update({
          parent_id: newParent.id,
          sort_order: newSortOrder,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflowId);

      if (error) throw error;
    } catch (error) {
      console.error('Error indenting workflow:', error);
      toast.error('Failed to indent workflow');
    }
  },

  outdentWorkflow: async (workflowId: string) => {
    try {
      const allWorkflows = await get().loadWorkflows();
      const workflow = allWorkflows.find(w => w.id === workflowId);
      if (!workflow || !workflow.parent_id) return;
      
      const parent = allWorkflows.find(w => w.id === workflow.parent_id);
      if (!parent) return;
      
      const newParentId = parent.parent_id || null;
      const newSortOrder = (parent.sort_order || 0) + 1;
      
      await supabase
        .from('workflows')
        .update({
          parent_id: newParentId,
          sort_order: newSortOrder,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflowId);
    } catch (error) {
      console.error('Error outdenting workflow:', error);
      toast.error('Failed to outdent workflow');
    }
  },

  moveWorkflowUp: async (workflowId: string) => {
    try {
      const allWorkflows = await get().loadWorkflows();
      const workflow = allWorkflows.find(w => w.id === workflowId);
      if (!workflow) return;
      
      const siblings = allWorkflows
        .filter(w => (w.parent_id || null) === (workflow.parent_id || null))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      
      const currentIndex = siblings.findIndex(w => w.id === workflowId);
      
      if (currentIndex <= 0) return;
      
      const previousSibling = siblings[currentIndex - 1];
      
      // Get actual sort_order values to swap (use actual values, not indices)
      const currentSortOrder = workflow.sort_order ?? currentIndex;
      const previousSortOrder = previousSibling.sort_order ?? (currentIndex - 1);
      
      // Use temporary negative value to avoid duplicate key constraint
      // Step 1: Move current to temp position
      // Step 2: Move previous to current's old position
      // Step 3: Move current to previous's old position
      const timestamp = new Date().toISOString();
      const tempSortOrder = -Date.now(); // Guaranteed unique negative
      
      await supabase
        .from('workflows')
        .update({ sort_order: tempSortOrder, updated_at: timestamp })
        .eq('id', workflowId);
      
      await supabase
        .from('workflows')
        .update({ sort_order: currentSortOrder, updated_at: timestamp })
        .eq('id', previousSibling.id);
      
      await supabase
        .from('workflows')
        .update({ sort_order: previousSortOrder, updated_at: timestamp })
        .eq('id', workflowId);
    } catch (error) {
      console.error('Error moving workflow up:', error);
      toast.error('Failed to move workflow');
    }
  },

  moveWorkflowDown: async (workflowId: string) => {
    try {
      const allWorkflows = await get().loadWorkflows();
      const workflow = allWorkflows.find(w => w.id === workflowId);
      if (!workflow) return;
      
      const siblings = allWorkflows
        .filter(w => (w.parent_id || null) === (workflow.parent_id || null))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      
      const currentIndex = siblings.findIndex(w => w.id === workflowId);
      
      if (currentIndex >= siblings.length - 1) return;
      
      const nextSibling = siblings[currentIndex + 1];
      
      // Get actual sort_order values to swap (use actual values, not indices)
      const currentSortOrder = workflow.sort_order ?? currentIndex;
      const nextSortOrder = nextSibling.sort_order ?? (currentIndex + 1);
      
      // Use temporary negative value to avoid duplicate key constraint
      const timestamp = new Date().toISOString();
      const tempSortOrder = -Date.now(); // Guaranteed unique negative
      
      await supabase
        .from('workflows')
        .update({ sort_order: tempSortOrder, updated_at: timestamp })
        .eq('id', workflowId);
      
      await supabase
        .from('workflows')
        .update({ sort_order: currentSortOrder, updated_at: timestamp })
        .eq('id', nextSibling.id);
      
      await supabase
        .from('workflows')
        .update({ sort_order: nextSortOrder, updated_at: timestamp })
        .eq('id', workflowId);
    } catch (error) {
      console.error('Error moving workflow down:', error);
      toast.error('Failed to move workflow');
    }
  },

  toggleWorkflowExpanded: async (workflowId) => {
    try {
      // Find the workflow in a list (we need to load workflows first)
      const workflows = await get().loadWorkflows();
      const workflow = workflows.find(w => w.id === workflowId);
      
      if (!workflow) return;

      const newExpandedState = !workflow.is_expanded;
      
      const { error } = await supabase
        .from('workflows')
        .update({
          is_expanded: newExpandedState,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflowId);

      if (error) throw error;
    } catch (error) {
      console.error('Error toggling workflow expansion:', error);
    }
  },

  getWorkflowHierarchy: (workflows) => {
    // Build a map of parent to children
    const childrenMap = new Map<string | null, Workflow[]>();
    
    workflows.forEach(workflow => {
      const parentId = workflow.parent_id || null;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(workflow);
    });

    // Sort each level by sort_order
    childrenMap.forEach(children => {
      children.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    });

    // Recursively build hierarchy
    const buildHierarchy = (parentId: string | null, level: number): WorkflowHierarchyItem[] => {
      const children = childrenMap.get(parentId) || [];
      return children.map(workflow => ({
        workflow,
        level,
        children: buildHierarchy(workflow.id, level + 1),
      }));
    };

    return buildHierarchy(null, 0);
  },

  toggleAIConversation: () => set((state) => ({
    isAIConversationOpen: !state.isAIConversationOpen
  })),

  setNodePreviewLoading: (nodeId: string, isLoading: boolean) => {
    set((state) => {
      const newMap = new Map(state.nodePreviewData);
      const existing = newMap.get(nodeId) || {
        output: null,
        executedAt: null,
        isLoading: false,
        cached: false,
      };
      newMap.set(nodeId, { ...existing, isLoading });
      return { nodePreviewData: newMap };
    });
  },

  setSelectedCompany: (companyId, companyName) => set({ 
    selectedCompanyId: companyId, 
    selectedCompanyName: companyName,
    // Clear preview data when switching companies
    nodePreviewData: new Map(),
  }),

  loadCompanies: async () => {
    const { data } = await supabase
      .from('companies')
      .select('id, name, slug')
      .eq('status', 'active')
      .order('name', { ascending: true });
    
    const companies = data || [];
    set({ companies });
    
    // Default to "Test" company if not already selected
    const state = get();
    if (!state.selectedCompanyId) {
      const testCompany = companies.find(c => c.name === 'Test');
      if (testCompany) {
        set({ 
          selectedCompanyId: testCompany.id, 
          selectedCompanyName: testCompany.name 
        });
      }
    }
  },

  loadNodePreview: async (nodeId: string) => {
    const state = get();
    const workflowId = state.workflow.id;
    const companyId = state.selectedCompanyId;
    
    if (!workflowId || workflowId === '1' || workflowId.startsWith('temp-')) {
      return; // No valid workflow
    }

    if (!companyId) {
      return; // No company selected
    }

    // Check if this is a shared cache dataset node
    const node = state.workflow.nodes.find(n => n.id === nodeId);
    const isSharedCacheDataset = node?.type === 'dataset' && 
      node?.config?.sourceType === 'shared_cache' && 
      node?.config?.sharedCacheId;

    try {
      if (isSharedCacheDataset) {
        // Load from shared_cache_data for shared cache dataset nodes
        const { data: cacheData, error } = await supabase
          .from('shared_cache_data')
          .select('data, node_label, updated_at')
          .match({ 
            shared_cache_id: node.config.sharedCacheId,
            company_id: companyId 
          })
          .order('updated_at', { ascending: false });

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading shared cache preview:', error);
          return;
        }

        // Aggregate entries by node label (same logic as execute-single-node)
        let aggregatedOutput: Record<string, unknown> = {};
        let latestTimestamp: string | null = null;
        
        if (cacheData && cacheData.length > 0) {
          for (const entry of cacheData) {
            const key = (entry.node_label || 'data').toLowerCase().replace(/\s+/g, '_');
            aggregatedOutput[key] = (entry.data as Record<string, unknown>)?.output;
            if (!latestTimestamp || entry.updated_at > latestTimestamp) {
              latestTimestamp = entry.updated_at;
            }
          }
        }

        set((prevState) => {
          const newMap = new Map(prevState.nodePreviewData);
          newMap.set(nodeId, {
            output: Object.keys(aggregatedOutput).length > 0 ? aggregatedOutput : null,
            executedAt: latestTimestamp,
            isLoading: false,
            cached: cacheData && cacheData.length > 0,
          });
          return { nodePreviewData: newMap };
        });
      } else {
        // Original logic for other node types
        const { data: nodeData, error } = await supabase
          .from('company_node_data')
          .select('data, last_executed_at, content_hash')
          .match({ 
            company_id: companyId, 
            workflow_id: workflowId, 
            node_id: nodeId 
          })
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error loading node preview:', error);
          return;
        }

        set((prevState) => {
          const newMap = new Map(prevState.nodePreviewData);
          const dataObj = nodeData?.data as Record<string, unknown> | null;
          newMap.set(nodeId, {
            output: dataObj?.output ?? null,
            executedAt: nodeData?.last_executed_at ?? null,
            isLoading: false,
            cached: !!nodeData?.content_hash,
          });
          return { nodePreviewData: newMap };
        });
      }
    } catch (error) {
      console.error('Error loading node preview:', error);
    }
  },

  runTestNodes: async (nodeIds: string[]) => {
    const state = get();
    const workflowId = state.workflow.id;
    
    if (!workflowId || workflowId === '1' || workflowId.startsWith('temp-')) {
      toast.error('Please save the workflow first');
      return;
    }

    // Set loading state for all nodes
    set({ isTestRunning: true });
    nodeIds.forEach(nodeId => {
      get().setNodePreviewLoading(nodeId, true);
    });

    try {
      const companyId = state.selectedCompanyId;
      const response = await supabase.functions.invoke('test-nodes', {
        body: { workflowId, nodeIds, companyId }
      });

      if (response.error) {
        throw response.error;
      }

      const { success, results, stats, errors } = response.data;

      if (!success) {
        throw new Error('Test execution failed');
      }

      // Update preview data for each node
      set((prevState) => {
        const newMap = new Map(prevState.nodePreviewData);
        
        for (const nodeId of nodeIds) {
          const result = results[nodeId];
          if (result) {
            newMap.set(nodeId, {
              output: result.output,
              executedAt: result.executedAt,
              isLoading: false,
              cached: result.cached,
              error: undefined,
            });
          }
        }
        
        return { nodePreviewData: newMap, isTestRunning: false };
      });

      // Show toast with results
      const executedCount = stats.executed;
      const cachedCount = stats.cached;
      const errorCount = stats.errors;
      
      if (errorCount > 0) {
        toast.warning(`Executed ${executedCount} nodes (${cachedCount} cached, ${errorCount} errors)`);
      } else {
        toast.success(`Executed ${executedCount} nodes (${cachedCount} cached) in ${stats.executionTimeMs}ms`);
      }

    } catch (error) {
      console.error('Error running test nodes:', error);
      
      // Set error state for all nodes
      set((prevState) => {
        const newMap = new Map(prevState.nodePreviewData);
        
        for (const nodeId of nodeIds) {
          const existing = newMap.get(nodeId);
          newMap.set(nodeId, {
            output: existing?.output ?? null,
            executedAt: existing?.executedAt ?? null,
            isLoading: false,
            cached: existing?.cached ?? false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
        
        return { nodePreviewData: newMap, isTestRunning: false };
      });

      toast.error(error instanceof Error ? error.message : 'Failed to run test');
    }
  },

  deleteWorkflow: async (workflowId: string): Promise<boolean> => {
    try {
      const response = await supabase.functions.invoke('delete-workflow', {
        body: { id: workflowId }
      });

      if (response.error) throw response.error;

      // If deleted workflow is current, load another or create new
      const state = get();
      if (state.workflow.id === workflowId) {
        const workflows = await get().loadWorkflows();
        if (workflows.length > 0) {
          get().loadWorkflow(workflows[0]);
        } else {
          get().createNewWorkflow();
        }
      }

      // Dispatch event to refresh workflow list
      window.dispatchEvent(new CustomEvent('workflowSaved'));

      return true;
    } catch (error) {
      console.error('Error deleting workflow:', error);
      toast.error('Failed to delete workflow');
      return false;
    }
  },

  forceRunWorkflow: async () => {
    const state = get();
    const workflowId = state.workflow.id;
    const companyId = state.selectedCompanyId;
    const workflowName = state.workflow.name;

    // Validate prerequisites
    if (!workflowId || workflowId === '1' || workflowId.startsWith('temp-')) {
      return { success: false, message: 'Please save the workflow first' };
    }

    if (!companyId) {
      return { success: false, message: 'Please select a company first' };
    }

    set({ isForceRunning: true });

    try {
      // Create a trigger submission to track this force run
      const { data: submission, error: submissionError } = await supabase
        .from('company_data_submissions')
        .insert({
          company_id: companyId,
          source_type: 'canvas_force_run',
          raw_data: { _trigger: 'canvas_force_run', workflow_id: workflowId },
          status: 'pending',
        })
        .select('id')
        .single();

      if (submissionError) {
        throw new Error('Failed to create trigger submission');
      }

      // Call run-company-workflows with force mode
      const response = await supabase.functions.invoke('run-company-workflows', {
        body: {
          company_id: companyId,
          submission_id: submission.id,
          workflow_id: workflowId,
          force: true,
        }
      });

      if (response.error) {
        throw response.error;
      }

      const result = response.data;

      // Refresh node preview data for all nodes in the workflow
      for (const node of state.workflow.nodes) {
        await get().loadNodePreview(node.id);
      }

      set({ isForceRunning: false });

      const message = result.workflowsExecuted 
        ? `${workflowName}: ${result.workflowsExecuted} workflow(s) executed`
        : `${workflowName}: Execution complete`;

      return { success: true, message };

    } catch (error) {
      console.error('Error force running workflow:', error);
      set({ isForceRunning: false });
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to run workflow' 
      };
    }
  },

  forceRunNode: async (nodeId: string) => {
    const state = get();
    const workflowId = state.workflow.id;
    const companyId = state.selectedCompanyId;
    const node = state.workflow.nodes.find(n => n.id === nodeId);

    // Validate prerequisites
    if (!workflowId || workflowId === '1' || workflowId.startsWith('temp-')) {
      return { success: false, message: 'Please save the workflow first' };
    }

    if (!companyId) {
      return { success: false, message: 'Please select a company first' };
    }

    if (!node) {
      return { success: false, message: 'Node not found' };
    }

    // Save before execution if there are unsaved changes
    if (state.workflow.unsavedChanges) {
      console.log('[forceRunNode] Saving before execution...');
      const { saveCurrentWorkflow } = await import('@/hooks/useSaveOnEvent');
      await saveCurrentWorkflow();
    }

    set({ isForceRunning: true });

    try {
      // Create a trigger submission to track this force run
      const { data: submission, error: submissionError } = await supabase
        .from('company_data_submissions')
        .insert({
          company_id: companyId,
          source_type: 'node_force_run',
          raw_data: { 
            _trigger: 'node_force_run', 
            workflow_id: workflowId,
            start_from_node_id: nodeId,
            node_label: node.label || nodeId,
          },
          status: 'pending',
        })
        .select('id')
        .single();

      if (submissionError) {
        throw new Error('Failed to create trigger submission');
      }

      // Call run-company-workflows with force mode and start_from_node_id
      const response = await supabase.functions.invoke('run-company-workflows', {
        body: {
          company_id: companyId,
          submission_id: submission.id,
          workflow_id: workflowId,
          force: true,
          start_from_node_id: nodeId,
        }
      });

      if (response.error) {
        throw response.error;
      }

      const result = response.data;

      // Find downstream nodes to refresh (including the starting node)
      const edges = state.workflow.edges;
      const nodesToRefresh = new Set<string>([nodeId]);
      
      // BFS to find all downstream nodes (edges + implicit dependencies)
      const queue = [nodeId];
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        
        // Edge-based downstream
        const downstreamEdges = edges.filter(e => e.from.node === currentId);
        for (const edge of downstreamEdges) {
          if (!nodesToRefresh.has(edge.to.node)) {
            nodesToRefresh.add(edge.to.node);
            queue.push(edge.to.node);
          }
        }
        
        // Agent nodes referencing this node as sourceNodeId
        for (const node of state.workflow.nodes) {
          if (node.type === 'agent' && 
              node.config?.sourceNodeId === currentId && 
              !nodesToRefresh.has(node.id)) {
            nodesToRefresh.add(node.id);
            queue.push(node.id);
          }
        }
        
        // PromptTemplate nodes with dependency on this node (via promptParts)
        for (const node of state.workflow.nodes) {
          if (node.type === 'promptTemplate' && 
              node.config?.promptParts && 
              !nodesToRefresh.has(node.id)) {
            const hasDep = node.config.promptParts.some(
              (p: any) => p.type === 'dependency' && p.value === currentId
            );
            if (hasDep) {
              nodesToRefresh.add(node.id);
              queue.push(node.id);
            }
          }
        }
      }

      // Refresh preview data for affected nodes
      for (const affectedNodeId of nodesToRefresh) {
        await get().loadNodePreview(affectedNodeId);
      }

      set({ isForceRunning: false });

      const nodesExecuted = result.workflowResults?.[0]?.executed?.length || 0;
      const message = `${node.label || nodeId}: Executed ${nodesExecuted} node(s) + downstream`;

      return { success: true, message };

    } catch (error) {
      console.error('Error force running node:', error);
      set({ isForceRunning: false });
      return { 
        success: false, 
        message: error instanceof Error ? error.message : 'Failed to run node' 
      };
    }
  },

  // Execute a single node via the new edge function
  // Supports optional workflowIdOverride for cross-workflow execution
  executeSingleNode: async (nodeId: string, workflowIdOverride?: string) => {
    const state = get();
    const workflowId = workflowIdOverride || state.workflow.id;
    const companyId = state.selectedCompanyId;

    if (!workflowId || !companyId) {
      return { success: false, nextNodes: [], error: 'Missing workflow or company' };
    }

    // Save only for current workflow before execution
    if (!workflowIdOverride && state.workflow.unsavedChanges) {
      console.log('[executeSingleNode] Saving before execution...');
      const { saveCurrentWorkflow } = await import('@/hooks/useSaveOnEvent');
      await saveCurrentWorkflow();
    }

    // Create abort controller with 5-minute timeout for long AI generations
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minutes

    try {
      const response = await supabase.functions.invoke('execute-single-node', {
        body: {
          company_id: companyId,
          workflow_id: workflowId,
          node_id: nodeId,
          force: true,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.error) {
        throw response.error;
      }

      const result = response.data;
      
      if (!result.success) {
        return { 
          success: false, 
          nextNodes: [], 
          error: result.error || 'Execution failed' 
        };
      }

      return {
        success: true,
        output: result.output,
        nextNodes: result.next_nodes || [],
      };
    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`[executeSingleNode] Error for node ${nodeId}:`, error);
      
      // Provide clearer error message for timeout
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      return {
        success: false,
        nextNodes: [],
        error: isTimeout 
          ? 'Request timed out after 5 minutes. The node may still be processing - check the preview after a moment.'
          : (error instanceof Error ? error.message : 'Unknown error')
      };
    }
  },

  // Client-side cascade orchestration - bulletproof one-node-at-a-time execution
  forceRunCascade: async (startNodeId?: string) => {
    const state = get();
    const workflowId = state.workflow.id;
    const companyId = state.selectedCompanyId;
    const workflowName = state.workflow.name;

    // Validate prerequisites
    if (!workflowId || workflowId === '1' || workflowId.startsWith('temp-')) {
      return { success: false, message: 'Please save the workflow first' };
    }

    if (!companyId) {
      return { success: false, message: 'Please select a company first' };
    }

    // Save before cascade execution if there are unsaved changes
    if (state.workflow.unsavedChanges) {
      console.log('[forceRunCascade] Saving before execution...');
      const { saveCurrentWorkflow } = await import('@/hooks/useSaveOnEvent');
      await saveCurrentWorkflow();
    }

    // Build topological order of nodes to execute
    const nodes = state.workflow.nodes;
    const edges = state.workflow.edges;
    
    // Helper to find all downstream nodes from a starting point
    const findDownstream = (fromNodeId: string): Set<string> => {
      const downstream = new Set<string>([fromNodeId]);
      const queue = [fromNodeId];
      
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        
        // NOTE: Visual edges (wires) are NOT used for cascade discovery
        // The Prompt Builder's dependency configuration is the single source of truth
        // Wires on the canvas are purely cosmetic and do not affect execution order
        
        // Agent nodes referencing this node - SKIP IF PAUSED
        for (const node of nodes) {
          if (node.type === 'agent' && 
              node.config?.sourceNodeId === currentId && 
              !downstream.has(node.id) &&
              node.config?.paused !== true) {  // Skip paused nodes
            downstream.add(node.id);
            queue.push(node.id);
          }
        }
        
        // ANY node type with promptParts dependency on this node - SKIP IF PAUSED
        // This includes promptTemplate, dataset, ingest, variable, integration, etc.
        for (const node of nodes) {
          if (node.config?.promptParts && 
              !downstream.has(node.id) &&
              node.config?.paused !== true) {  // Skip paused nodes
            const hasDep = node.config.promptParts.some(
              (p: any) => p.type === 'dependency' && 
                          p.value === currentId && 
                          (!p.workflowId || p.workflowId === workflowId) && // Same-workflow only
                          p.triggersExecution !== false  // Only cascade on triggering dependencies
            );
            if (hasDep) {
              downstream.add(node.id);
              queue.push(node.id);
            }
          }
        }
        
        // Variable nodes with ssotMapDependencies referencing this node - SKIP IF PAUSED
        for (const node of nodes) {
          if (node.type === 'variable' && 
              node.config?.ssotMapMode && 
              node.config?.ssotMapDependencies &&
              !downstream.has(node.id) &&
              node.config?.paused !== true) {
            const hasDep = node.config.ssotMapDependencies.some(
              (dep: any) => dep.nodeId === currentId &&
                            (!dep.workflowId || dep.workflowId === workflowId)
            );
            if (hasDep) {
              downstream.add(node.id);
              queue.push(node.id);
            }
          }
        }
      }
      
      return downstream;
    };

    // Determine nodes to execute
    let nodesToExecute: string[];
    if (startNodeId) {
      nodesToExecute = Array.from(findDownstream(startNodeId));
    } else {
      // Find source nodes (ingest or dataset with company_ingest or shared_cache)
      const sourceNodes = nodes.filter(n => 
        n.type === 'ingest' || 
        (n.type === 'dataset' && n.config?.sourceType === 'company_ingest') ||
        (n.type === 'dataset' && n.config?.sourceType === 'shared_cache')
      );
      
      if (sourceNodes.length === 0) {
        // If no source node, just execute all nodes
        nodesToExecute = nodes.map(n => n.id);
      } else {
        // Execute from each source node
        const allDownstream = new Set<string>();
        for (const source of sourceNodes) {
          findDownstream(source.id).forEach(id => allDownstream.add(id));
        }
        nodesToExecute = Array.from(allDownstream);
      }
    }

    // Filter out paused nodes and non-executable decorative nodes from execution list
    nodesToExecute = nodesToExecute.filter(nodeId => {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) return false;
      if (node.config?.paused === true) return false;
      if (NON_EXECUTABLE_TYPES.has(node.type)) return false;
      return true;
    });

    // Topological sort the nodes to execute
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();
    
    nodesToExecute.forEach(id => {
      inDegree.set(id, 0);
      adjacency.set(id, []);
    });
    
    // NOTE: Visual edges (wires) are NOT used for execution ordering
    // The Prompt Builder's dependency configuration determines execution order
    // Only promptParts and agent sourceNodeId dependencies are considered below

    // Add promptParts and agent sourceNodeId dependencies to the graph
    for (const node of nodes) {
      if (!nodesToExecute.includes(node.id)) continue;
      
      // PromptParts dependencies (type: 'dependency' references other nodes)
      if (node.config?.promptParts) {
        for (const part of node.config.promptParts) {
          if (part.type === 'dependency' && 
              nodesToExecute.includes(part.value) &&
              (!part.workflowId || part.workflowId === workflowId) && // Same-workflow or unset
              part.triggersExecution !== false) { // Only triggering dependencies affect order
            // part.value is the source node, node.id is the target
            if (!adjacency.get(part.value)?.includes(node.id)) {
              adjacency.get(part.value)?.push(node.id);
              inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
            }
          }
        }
      }
      
      // Agent sourceNodeId dependencies
      if (node.type === 'agent' && 
          node.config?.sourceNodeId && 
          nodesToExecute.includes(node.config.sourceNodeId)) {
        const sourceId = node.config.sourceNodeId;
        if (!adjacency.get(sourceId)?.includes(node.id)) {
          adjacency.get(sourceId)?.push(node.id);
          inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
        }
      }
      
      // ssotMapDependencies for variable nodes in SSOT Map mode
      if (node.type === 'variable' && 
          node.config?.ssotMapMode && 
          node.config?.ssotMapDependencies) {
        for (const dep of node.config.ssotMapDependencies) {
          if (dep.nodeId && 
              nodesToExecute.includes(dep.nodeId) &&
              (!dep.workflowId || dep.workflowId === workflowId)) {
            if (!adjacency.get(dep.nodeId)?.includes(node.id)) {
              adjacency.get(dep.nodeId)?.push(node.id);
              inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
            }
          }
        }
      }
    }

    // Kahn's algorithm for topological sort
    const sortedNodes: string[] = [];
    const queue: string[] = [];
    
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) queue.push(nodeId);
    });
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      sortedNodes.push(nodeId);
      
      for (const neighbor of adjacency.get(nodeId) || []) {
        const newDegree = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Create a trigger submission to track this cascade run
    const { data: cascadeSubmission, error: cascadeSubError } = await supabase
      .from('company_data_submissions')
      .insert({
        company_id: companyId,
        source_type: 'canvas_force_run',
        raw_data: { 
          _trigger: startNodeId ? 'node_force_run' : 'force_run', 
          workflow_id: workflowId,
          start_from_node_id: startNodeId || null,
        },
        status: 'processing',
        metadata: JSON.parse(JSON.stringify({
          progress: {
            current: 0,
            total: sortedNodes.length,
            current_node_label: null,
            current_workflow_name: workflowName,
            completed_nodes: 0,
            failed_at_node: null,
          }
        }))
      })
      .select('id')
      .single();

    if (cascadeSubError) {
      console.warn('[forceRunCascade] Failed to create tracking submission:', cascadeSubError);
    }
    const cascadeSubmissionId = cascadeSubmission?.id;

    // Initialize progress
    set({ 
      isForceRunning: true,
      cascadeProgress: {
        current: 0,
        total: sortedNodes.length,
        currentNodeId: null,
        currentNodeLabel: null,
        currentWorkflowName: workflowName,
        executingNodeIds: [],
        completedNodeIds: [],
        failedNodeId: null,
        error: null,
        submissionId: cascadeSubmissionId || null,
      }
    });

    const completedNodes: string[] = [];
    let failedNode: { id: string; error: string } | null = null;

    // Helper to update submission progress metadata
    const updateSubmissionProgress = async (progress: Record<string, unknown>) => {
      if (!cascadeSubmissionId) return;
      await supabase.from('company_data_submissions')
        .update({ metadata: JSON.parse(JSON.stringify({ progress })) })
        .eq('id', cascadeSubmissionId);
    };

    try {
      // Execute nodes in topological order
      for (let i = 0; i < sortedNodes.length; i++) {
        const nodeId = sortedNodes[i];
        const node = nodes.find(n => n.id === nodeId);

        // Check for cancellation before each node
        if (cascadeSubmissionId && get().cancelledCascadeIds.has(cascadeSubmissionId)) {
          console.log('[forceRunCascade] Cancelled by user');
          await supabase.from('company_data_submissions')
            .update({ status: 'failed', error_message: 'Cancelled by user', processed_at: new Date().toISOString() })
            .eq('id', cascadeSubmissionId);
          const cancelled = get().cancelledCascadeIds;
          const next = new Set(cancelled);
          next.delete(cascadeSubmissionId);
          set({ cancelledCascadeIds: next, isForceRunning: false, cascadeProgress: null });
          return { success: false, message: 'Cancelled by user' };
        }
        
        // Skip paused nodes
        if (node?.config?.paused === true) {
          console.log(`[forceRunCascade] Skipping paused node: ${node.label || nodeId}`);
          completedNodes.push(nodeId);
          continue;
        }
        
        const nodeLabel = node?.label || nodeId;

        // Update progress (local + DB)
        set({
          cascadeProgress: {
            current: i,
            total: sortedNodes.length,
            currentNodeId: nodeId,
            currentNodeLabel: nodeLabel,
            currentWorkflowName: workflowName,
            executingNodeIds: [nodeId],
            completedNodeIds: [...completedNodes],
            failedNodeId: null,
            error: null,
            submissionId: cascadeSubmissionId || null,
          }
        });

        updateSubmissionProgress({
          current: i,
          total: sortedNodes.length,
          current_node_label: nodeLabel,
          current_workflow_name: workflowName,
          completed_nodes: completedNodes.length,
          failed_at_node: null,
        });

        console.log(`[forceRunCascade] Executing node ${i + 1}/${sortedNodes.length}: ${nodeLabel}`);
        
        const result = await get().executeSingleNode(nodeId);
        
        if (!result.success) {
          failedNode = { id: nodeId, error: result.error || 'Unknown error' };
          console.error(`[forceRunCascade] Node failed: ${nodeLabel} - ${result.error}`);
          break;
        }
        
        completedNodes.push(nodeId);
        
        // Refresh preview for this node
        await get().loadNodePreview(nodeId);
      }

      // Final state update
      if (failedNode) {
        const failedNodeObj = nodes.find(n => n.id === failedNode!.id);
        const failedLabel = failedNodeObj?.label || failedNode.id;

        // Update submission as failed
        if (cascadeSubmissionId) {
          await supabase.from('company_data_submissions')
            .update({
              status: 'failed',
              error_message: `Failed at "${failedLabel}": ${failedNode.error}`,
              processed_at: new Date().toISOString(),
              metadata: JSON.parse(JSON.stringify({
                progress: {
                  current: completedNodes.length,
                  total: sortedNodes.length,
                  current_node_label: failedLabel,
                  current_workflow_name: workflowName,
                  completed_nodes: completedNodes.length,
                  failed_at_node: failedLabel,
                }
              }))
            })
            .eq('id', cascadeSubmissionId);
        }

        set({
          isForceRunning: false,
          cascadeProgress: {
            current: completedNodes.length,
            total: sortedNodes.length,
            currentNodeId: null,
            currentNodeLabel: null,
            currentWorkflowName: workflowName,
            executingNodeIds: [],
            completedNodeIds: completedNodes,
            failedNodeId: failedNode.id,
            error: failedNode.error,
            submissionId: cascadeSubmissionId || null,
          },
        });

        return {
          success: false,
          message: `Failed at "${failedLabel}": ${failedNode.error}`
        };
      }

      // Mark submission as completed
      if (cascadeSubmissionId) {
        await supabase.from('company_data_submissions')
          .update({
            status: 'completed',
            processed_at: new Date().toISOString(),
            metadata: JSON.parse(JSON.stringify({
              progress: {
                current: completedNodes.length,
                total: sortedNodes.length,
                current_node_label: null,
                current_workflow_name: workflowName,
                completed_nodes: completedNodes.length,
                failed_at_node: null,
              }
            }))
          })
          .eq('id', cascadeSubmissionId);
      }

      set({
        isForceRunning: false,
        cascadeProgress: null,
      });

      return {
        success: true,
        message: `${workflowName}: Executed ${completedNodes.length} node(s)`
      };

    } catch (error) {
      console.error('[forceRunCascade] Unexpected error:', error);
      
      if (cascadeSubmissionId) {
        await supabase.from('company_data_submissions')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            processed_at: new Date().toISOString(),
          })
          .eq('id', cascadeSubmissionId);
      }

      set({ 
        isForceRunning: false,
        cascadeProgress: null
      });
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Cascade execution failed'
      };
    }
  },

  // Cross-workflow system trigger with client-side orchestration
  // Fetches ALL relevant workflows, builds unified dependency graph, executes sequentially
  runSystemWorkflows: async (triggerNodeId?: string) => {
    const state = get();
    const companyId = state.selectedCompanyId;
    const companyName = state.selectedCompanyName;
    const currentWorkflowId = state.workflow.id;

    if (!companyId) {
      return { success: false, message: 'Please select a company first' };
    }

    // Auto-save current workflow if needed
    if (state.workflow.unsavedChanges) {
      console.log('[runSystemWorkflows] Auto-saving current workflow...');
      await get().saveWorkflow({ silent: true });
    }

    // Create trigger submission
    const { data: submission, error: insertError } = await supabase
      .from('company_data_submissions')
      .insert({
        company_id: companyId,
        source_type: 'manual_ingest_trigger',
        raw_data: { 
          _trigger: 'system_workflows',
          trigger_node_id: triggerNodeId,
          initiated_from_workflow: currentWorkflowId,
        },
        status: 'pending',
      })
      .select('id')
      .single();

    if (insertError || !submission) {
      console.error('[runSystemWorkflows] Failed to create submission:', insertError);
      return { success: false, message: 'Failed to create trigger submission' };
    }

    const submissionId = submission.id;

    // Update to processing
    await supabase.from('company_data_submissions')
      .update({ status: 'processing' })
      .eq('id', submissionId);

    console.log(`[runSystemWorkflows] Starting system execution for company ${companyName} (submission: ${submissionId})`);

    try {
      // Fetch all relevant workflows (company_data or company_related_data)
      const { data: workflows, error: workflowsError } = await supabase
        .from('workflows')
        .select('id, name, nodes, edges, settings')
        .or('settings->>data_attribution.eq.company_data,settings->>data_attribution.eq.company_related_data,settings->>data_attribution.is.null');

      if (workflowsError || !workflows) {
        const msg = workflowsError?.message || '';
        if (msg.includes('Failed to fetch') || msg.includes('JWT') || (workflowsError as any)?.code === 'PGRST301') {
          throw new Error('Session expired. Please refresh the page and log in again.');
        }
        throw new Error('Failed to fetch workflows: ' + msg);
      }

      console.log(`[runSystemWorkflows] Found ${workflows.length} relevant workflow(s)`);

      // Build cross-workflow node registry
      interface CrossWorkflowNode {
        nodeId: string;
        workflowId: string;
        workflowName: string;
        node: NodeBase;
        dependencies: Array<{ nodeId: string; workflowId: string }>;
      }

      const allNodes: CrossWorkflowNode[] = [];
      const nodeRegistry = new Map<string, CrossWorkflowNode>(); // key: "workflowId:nodeId"

      // First pass: register all nodes
      for (const workflow of workflows) {
        const workflowNodes = (workflow.nodes as unknown as NodeBase[]) || [];
      for (const node of workflowNodes) {
          // Skip paused nodes and non-executable decorative nodes
          if (node.config?.paused === true) continue;
          if (NON_EXECUTABLE_TYPES.has(node.type)) continue;
          
          const crossNode: CrossWorkflowNode = {
            nodeId: node.id,
            workflowId: workflow.id,
            workflowName: workflow.name,
            node,
            dependencies: [],
          };
          
          const key = `${workflow.id}:${node.id}`;
          nodeRegistry.set(key, crossNode);
          allNodes.push(crossNode);
        }
      }

      // Second pass: build dependencies
      for (const workflow of workflows) {
        const workflowNodes = (workflow.nodes as unknown as NodeBase[]) || [];
        for (const node of workflowNodes) {
          if (node.config?.paused === true) continue;
          if (NON_EXECUTABLE_TYPES.has(node.type)) continue;
          
          const key = `${workflow.id}:${node.id}`;
          const crossNode = nodeRegistry.get(key);
          if (!crossNode) continue;

          // PromptParts dependencies
          if (node.config?.promptParts) {
            for (const part of node.config.promptParts) {
              if (part.type === 'dependency' && part.triggersExecution !== false) {
                const depWorkflowId = part.workflowId || workflow.id;
                const depNodeId = part.value;
                const depKey = `${depWorkflowId}:${depNodeId}`;
                
                if (nodeRegistry.has(depKey)) {
                  crossNode.dependencies.push({ nodeId: depNodeId, workflowId: depWorkflowId });
                }
              }
            }
          }

          // Agent sourceNodeId (always same workflow)
          if (node.type === 'agent' && node.config?.sourceNodeId) {
            const depKey = `${workflow.id}:${node.config.sourceNodeId}`;
            if (nodeRegistry.has(depKey)) {
              crossNode.dependencies.push({ nodeId: node.config.sourceNodeId, workflowId: workflow.id });
            }
          }

          // Variable SSOT map dependencies
          if (node.type === 'variable' && node.config?.ssotMapMode && node.config?.ssotMapDependencies) {
            for (const dep of node.config.ssotMapDependencies) {
              if (dep.nodeId) {
                const depWorkflowId = dep.workflowId || workflow.id;
                const depKey = `${depWorkflowId}:${dep.nodeId}`;
                if (nodeRegistry.has(depKey)) {
                  crossNode.dependencies.push({ nodeId: dep.nodeId, workflowId: depWorkflowId });
                }
              }
            }
          }
        }
      }

      // Build in-degree map and adjacency list for topological sort
      const inDegree = new Map<string, number>();
      const adjacency = new Map<string, string[]>();

      for (const crossNode of allNodes) {
        const key = `${crossNode.workflowId}:${crossNode.nodeId}`;
        inDegree.set(key, 0);
        adjacency.set(key, []);
      }

      for (const crossNode of allNodes) {
        const targetKey = `${crossNode.workflowId}:${crossNode.nodeId}`;
        for (const dep of crossNode.dependencies) {
          const sourceKey = `${dep.workflowId}:${dep.nodeId}`;
          if (adjacency.has(sourceKey) && !adjacency.get(sourceKey)?.includes(targetKey)) {
            adjacency.get(sourceKey)?.push(targetKey);
            inDegree.set(targetKey, (inDegree.get(targetKey) || 0) + 1);
          }
        }
      }

      // === Downstream filtering ===
      // When a triggerNodeId is provided, only execute that node and its downstream dependents
      if (triggerNodeId) {
        const triggerKey = `${currentWorkflowId}:${triggerNodeId}`;
        const downstreamKeys = new Set<string>();
        const walkQueue = [triggerKey];

        while (walkQueue.length > 0) {
          const k = walkQueue.shift()!;
          if (downstreamKeys.has(k)) continue;
          downstreamKeys.add(k);
          for (const neighbor of adjacency.get(k) || []) {
            walkQueue.push(neighbor);
          }
        }

        // Remove non-downstream nodes from the graph
        for (const [key] of nodeRegistry) {
          if (!downstreamKeys.has(key)) {
            inDegree.delete(key);
            adjacency.delete(key);
            nodeRegistry.delete(key);
          }
        }

        // Also clean adjacency targets that point to removed nodes
        for (const [key, neighbors] of adjacency) {
          adjacency.set(key, neighbors.filter(n => inDegree.has(n)));
        }

        // Recompute in-degrees after filtering
        for (const [key] of inDegree) {
          inDegree.set(key, 0);
        }
        for (const [, neighbors] of adjacency) {
          for (const n of neighbors) {
            inDegree.set(n, (inDegree.get(n) || 0) + 1);
          }
        }

        console.log(`[runSystemWorkflows] Downstream filter from ${triggerNodeId}: ${inDegree.size} nodes in scope`);
      }

      // === Start-node priority ===
      // Ensure the trigger node always runs first by making all other zero-in-degree nodes depend on it
      if (triggerNodeId) {
        const triggerKey = `${currentWorkflowId}:${triggerNodeId}`;
        if (inDegree.has(triggerKey)) {
          const zeroInDegreeNodes: string[] = [];
          inDegree.forEach((degree, key) => {
            if (degree === 0 && key !== triggerKey) zeroInDegreeNodes.push(key);
          });
          for (const key of zeroInDegreeNodes) {
            if (!adjacency.get(triggerKey)?.includes(key)) {
              adjacency.get(triggerKey)?.push(key);
              inDegree.set(key, (inDegree.get(key) || 0) + 1);
            }
          }
        }
      }

      // Kahn's algorithm for topological sort
      const sortedKeys: string[] = [];
      const queue: string[] = [];

      inDegree.forEach((degree, key) => {
        if (degree === 0) queue.push(key);
      });

      while (queue.length > 0) {
        const key = queue.shift()!;
        sortedKeys.push(key);

        for (const neighbor of adjacency.get(key) || []) {
          const newDegree = (inDegree.get(neighbor) || 1) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0) {
            queue.push(neighbor);
          }
        }
      }

      console.log(`[runSystemWorkflows] Topological sort: ${sortedKeys.length} nodes across ${workflows.length} workflows (sequential)`);

      // Initialize progress
      set({
        isForceRunning: true,
        isSystemRunning: true,
        cascadeProgress: {
          current: 0,
          total: sortedKeys.length,
          currentNodeId: null,
          currentNodeLabel: null,
          currentWorkflowName: null,
          executingNodeIds: [],
          completedNodeIds: [],
          failedNodeId: null,
          error: null,
          submissionId: submissionId,
        }
      });

      const completedNodes: string[] = [];
      let failedNode: { key: string; label: string; error: string } | null = null;

      // === Sequential execution (one node at a time, strict ordering) ===
      for (let i = 0; i < sortedKeys.length; i++) {
        if (failedNode) break;

        const key = sortedKeys[i];
        const crossNode = nodeRegistry.get(key);
        if (!crossNode) { completedNodes.push(key); continue; }

        // Check for cancellation before each node
        if (get().cancelledCascadeIds.has(submissionId)) {
          console.log('[runSystemWorkflows] Cancelled by user');
          await supabase.from('company_data_submissions')
            .update({ status: 'failed', error_message: 'Cancelled by user', processed_at: new Date().toISOString() })
            .eq('id', submissionId);
          const cancelled = get().cancelledCascadeIds;
          const next = new Set(cancelled);
          next.delete(submissionId);
          set({ cancelledCascadeIds: next, isForceRunning: false, isSystemRunning: false, cascadeProgress: null });
          return { success: false, message: 'Cancelled by user' };
        }

        const nodeLabel = crossNode.node.label || crossNode.nodeId;

        // Update progress
        set({
          cascadeProgress: {
            current: i,
            total: sortedKeys.length,
            currentNodeId: crossNode.nodeId,
            currentNodeLabel: nodeLabel,
            currentWorkflowName: crossNode.workflowName,
            executingNodeIds: [crossNode.nodeId],
            completedNodeIds: [...completedNodes],
            failedNodeId: null,
            error: null,
            submissionId: submissionId,
          }
        });

        // Write progress to submission metadata
        supabase.from('company_data_submissions')
          .update({
            metadata: JSON.parse(JSON.stringify({
              progress: {
                current: i,
                total: sortedKeys.length,
                current_node_label: nodeLabel,
                current_workflow_name: crossNode.workflowName,
                completed_nodes: completedNodes.length,
                failed_at_node: null,
              }
            }))
          })
          .eq('id', submissionId)
          .then(() => {});

        console.log(`[runSystemWorkflows] [${i + 1}/${sortedKeys.length}] Executing: ${crossNode.workflowName} > ${nodeLabel}`);

        const result = await get().executeSingleNode(crossNode.nodeId, crossNode.workflowId);

        if (!result.success) {
          const label = `${crossNode.workflowName} > ${nodeLabel}`;
          failedNode = { key, label, error: result.error || 'Unknown error' };
          console.error(`[runSystemWorkflows] Node failed: ${label} - ${failedNode.error}`);
          break;
        }

        completedNodes.push(key);

        // Refresh preview if this node is in the current workflow
        if (crossNode.workflowId === currentWorkflowId) {
          await get().loadNodePreview(crossNode.nodeId);
        }
      }

      // Update submission status
      if (failedNode) {
        await supabase.from('company_data_submissions')
          .update({
            status: 'failed',
            error_message: `Failed at ${failedNode.label}: ${failedNode.error}`,
            processed_at: new Date().toISOString(),
            metadata: JSON.parse(JSON.stringify({ 
              progress: {
                current: completedNodes.length,
                total: sortedKeys.length,
                current_node_label: failedNode.label,
                current_workflow_name: null,
                completed_nodes: completedNodes.length,
                failed_at_node: failedNode.label,
              },
              failed_at: failedNode.key,
            }))
          })
          .eq('id', submissionId);

        set({
          isForceRunning: false,
          isSystemRunning: false,
          cascadeProgress: {
            current: completedNodes.length,
            total: sortedKeys.length,
            currentNodeId: null,
            currentNodeLabel: null,
            currentWorkflowName: null,
            executingNodeIds: [],
            completedNodeIds: completedNodes,
            failedNodeId: failedNode.key,
            error: failedNode.error,
            submissionId: submissionId,
          }
        });

        return { success: false, message: `Failed at "${failedNode.label}": ${failedNode.error}` };
      }

      // Success
      await supabase.from('company_data_submissions')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          metadata: JSON.parse(JSON.stringify({ 
            progress: {
              current: completedNodes.length,
              total: sortedKeys.length,
              current_node_label: null,
              current_workflow_name: null,
              completed_nodes: completedNodes.length,
              failed_at_node: null,
            },
            workflows_count: workflows.length,
          }))
        })
        .eq('id', submissionId);

      set({
        isForceRunning: false,
        isSystemRunning: false,
        cascadeProgress: null,
      });

      return {
        success: true,
        message: `System workflows: Executed ${completedNodes.length} node(s) across ${workflows.length} workflow(s)`
      };

    } catch (error) {
      console.error('[runSystemWorkflows] Unexpected error:', error);
      
      // Mark submission as failed
      await supabase.from('company_data_submissions')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          processed_at: new Date().toISOString(),
        })
        .eq('id', submissionId);

      set({
        isForceRunning: false,
        isSystemRunning: false,
        cascadeProgress: null,
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : 'System workflow execution failed'
      };
    }
  },

  syncSharedCaches: async (sharedCacheIds?: string[]) => {
    const state = get();
    const workflowId = state.workflow.id;
    const companyId = state.selectedCompanyId;
    const workflowName = state.workflow.name;

    if (!companyId) {
      return { success: false, message: 'Select a company first' };
    }

    if (workflowId === '1' || workflowId.startsWith('temp-')) {
      return { success: false, message: 'Save the workflow first' };
    }

    console.log(`[syncSharedCaches] Syncing caches for workflow ${workflowName}, company ${state.selectedCompanyName}`, 
      sharedCacheIds ? `(filtered: ${sharedCacheIds.length} caches)` : '(all caches)');

    try {
      const response = await supabase.functions.invoke('sync-shared-caches', {
        body: { 
          workflow_id: workflowId, 
          company_id: companyId,
          shared_cache_ids: sharedCacheIds 
        }
      });

      if (response.error) {
        console.error('[syncSharedCaches] Error:', response.error);
        return { success: false, message: response.error.message };
      }

      const data = response.data;
      console.log('[syncSharedCaches] Result:', data);

      if (!data.success) {
        return { success: false, message: data.error || 'Sync failed' };
      }

      return {
        success: true,
        message: data.synced.length > 0 
          ? `Synced ${data.synced.length} cache(s): ${data.synced.slice(0, 3).join(', ')}${data.synced.length > 3 ? '...' : ''}`
          : 'No caches to sync (no nodes with shared cache outputs found)'
      };
    } catch (error) {
      console.error('[syncSharedCaches] Unexpected error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Sync failed'
      };
    }
  },

  // Navigation lock controls for critical multi-step operations
  lockNavigation: () => {
    set({ isNavigationLocked: true });
    console.log('[WorkflowStore] Navigation locked');
  },

  unlockNavigation: () => {
    set({ isNavigationLocked: false });
    console.log('[WorkflowStore] Navigation unlocked');
  },

  cancelCascade: (submissionId: string) => {
    const current = get().cancelledCascadeIds;
    const next = new Set(current);
    next.add(submissionId);
    set({ cancelledCascadeIds: next });
    console.log(`[WorkflowStore] Cascade cancellation requested for submission: ${submissionId}`);
  },

  // Direct save to a specific workflow without triggering loadWorkflow
  // Used by MoveToCanvasDialog to save intermediate states without race conditions
  saveWorkflowDirect: async (workflowData: Partial<Workflow> & { id: string }) => {
    try {
      const state = get();
      const response = await supabase.functions.invoke('save-workflow', {
        body: {
          id: workflowData.id,
          name: workflowData.name,
          description: null,
          nodes: workflowData.nodes,
          edges: workflowData.edges,
          variables: workflowData.variables,
          settings: workflowData.settings,
          parent_id: workflowData.parent_id,
          sort_order: workflowData.sort_order,
          _source: 'user',
          _transaction_id: `direct-${Date.now()}`,
          // PHASE 1 FIX: Add identity binding for server-side validation
          _identity_name: state.workflow._loadedIdentity?.name,
          _identity_token: state.workflow._loadedIdentity?.token,
        }
      });

      if (response.error) {
        console.error('[saveWorkflowDirect] Error:', response.error);
        return { success: false, error: response.error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('[saveWorkflowDirect] Unexpected error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Save failed' 
      };
    }
  },

  // Safe metadata update - updates name/settings WITHOUT triggering loadWorkflow's beacon save
  // This prevents cross-contamination when editing settings of a workflow
  updateWorkflowMetadata: (updates: Partial<Pick<Workflow, 'name' | 'settings' | 'parent_id'>>) => {
    set((state) => ({
      workflow: {
        ...state.workflow,
        ...updates,
        // Don't mark as unsaved - caller should save to DB directly
      }
    }));
  },
}));
