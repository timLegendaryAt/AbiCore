export type NodeID = string;

export type PortKind = "text" | "data" | "value";
export type PortDirection = "in" | "out";

export interface Port {
  id: string;
  kind: PortKind;
  direction: PortDirection;
  label?: string;
}

export type NodeType = "promptTemplate" | "promptPiece" | "dataset" | "ingest" | "variable" | "condition" | "foreach" | "framework" | "agent" | "note" | "workflow" | "integration" | "divider" | "shape" | "floatingEndpoint";

export interface DividerConfig {
  orientation: 'horizontal' | 'vertical';
  length: number;
  strokeWidth: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
}

export interface ShapeConfig {
  width: number;
  height: number;
  borderWidth: number;
  borderColor: string;
  borderStyle: 'solid' | 'dashed' | 'dotted';
  borderRadius: number;
  backgroundColor: string;
}

export interface NodeBase {
  id: NodeID;
  type: NodeType;
  label: string;
  position: { x: number; y: number };
  ports: Port[];
  config: Record<string, any>;
  errors?: string[];
  outputName?: string;
  dependencies?: string[];
}

export interface Edge {
  id: string;
  from: { node: NodeID; port: string };
  to: { node: NodeID; port: string };
}

export interface VariableDef {
  name: string;
  type: "string" | "number" | "boolean" | "json";
  default?: any;
  scope?: "global" | "node";
}

export type DataAttributionType = 'company_data' | 'company_related_data' | 'entity_data' | 'unrelated_data';

export interface WorkflowSettings {
  data_attribution: DataAttributionType;
  assigned_entity_id?: string;
}

export const defaultWorkflowSettings: WorkflowSettings = {
  data_attribution: 'company_data'
};

// Immutable identity fingerprint captured at workflow load time
// Used to prevent cross-workflow contamination during saves
export interface WorkflowLoadedIdentity {
  id: string;           // Workflow ID at load time
  name: string;         // Workflow name at load time
  token: string;        // Random session token for this load
  loadedAt: number;     // Timestamp when loaded
}

export interface Workflow {
  id: string;
  name: string;
  nodes: NodeBase[];
  edges: Edge[];
  variables: VariableDef[];
  version: number;
  unsavedChanges: boolean;
  improvementData?: NodeImprovementData[];
  parent_id?: string | null;
  sort_order?: number;
  is_expanded?: boolean;
  settings?: WorkflowSettings;
  // Identity binding: prevents saves from contaminating wrong workflow
  _loadedIdentity?: WorkflowLoadedIdentity;
}

export interface WorkflowHierarchyItem {
  workflow: Workflow;
  children: WorkflowHierarchyItem[];
  level: number;
}

export type PromptPartType = 'dependency' | 'prompt' | 'integration' | 'framework';

export interface PromptPart {
  id: string;
  type: PromptPartType;
  value: string; // For 'dependency': node id, For 'prompt': custom text, For 'integration': integration id, For 'framework': framework id
  order: number;
  // Cross-workflow dependency support
  workflowId?: string;   // Source workflow ID (for cross-workflow deps)
  workflowName?: string; // For display purposes
  nodeLabel?: string;    // Stored node label for cross-workflow deps
  // Framework support
  frameworkName?: string; // For display when type is 'framework'
  // Trigger control - determines if this dependency's update triggers node execution
  triggersExecution?: boolean; // Default: true
  // System Prompt support - when set, uses library prompt instead of value
  systemPromptId?: string;    // Reference to system_prompts.id
  systemPromptName?: string;  // Cached name for display
}

export interface MasterDataMapping {
  domain: string;
  field_key: string;
}

export interface PromptTemplateConfig {
  name: string;
  model: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  outputName?: string;
  description?: string; // Brief description shown on node
  dependencies?: string[]; // Deprecated, kept for migration
  promptParts?: PromptPart[];
  webSearch?: boolean; // Enable Google Search grounding for Gemini models
  enableStopTrigger?: boolean; // When true, appends "no match" instruction and stops downstream nodes
  // Master Data storage
  isMasterDataOutput?: boolean;
  masterDataMapping?: MasterDataMapping | null;
  // Global System Prompt reference (for node-level override)
  systemPromptId?: string;
  systemPromptName?: string;
}

export interface PromptPieceConfig {
  content: string;
  append_newline: boolean;
}

export type DatasetSourceType = 'dataset' | 'integration' | 'manual' | 'ssot_schema' | 'shared_cache';

export type IngestSourceType = 'company_submission' | 'integration' | 'api' | 'webhook';

export interface IngestConfig {
  sourceType: IngestSourceType;
  // Integration-specific fields
  integrationId?: string;        // e.g., 'abivc', 'abi'
  integrationName?: string;      // For display: 'AbiVC', 'Abi'
  ingestPointId?: string;        // e.g., 'initial_submission'
  ingestPointName?: string;      // For display: 'Initial Submission'
  // Existing fields
  schemaId?: string;
  schemaName?: string;
  fields?: IngestField[];
  source?: string; // For backward compatibility with execution engines
}

export interface IngestField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'array';
  required: boolean;
  description?: string;
}

export interface DatasetConfig {
  datasetId?: string;
  datasetName?: string;
  source: string;
  path: string;
  sample_size: number;
  sourceType?: DatasetSourceType;
  // Integration fields
  integrationId?: string;
  integrationName?: string;
  // Company Ingest fields
  ingestSchemaId?: string;
  ingestSchemaName?: string;
  ingestFields?: IngestField[];
  // Live fetch flag - when true, always fetch fresh data and don't trigger downstream
  fetchLive?: boolean;
  // Shared Cache fields
  sharedCacheId?: string;
  sharedCacheName?: string;
}

// Shared Cache from database
export interface SharedCache {
  id: string;
  name: string;
  description: string | null;
  schema: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Shared Cache output destination for generative nodes
export interface SharedCacheOutputDestination {
  shared_cache_id: string;
  shared_cache_name: string;
  enabled: boolean;
  field_mapping?: Record<string, string>;
}

// Scoring Mode types for Transformation nodes
export interface ScoreStageConfig {
  stage: string;           // 'ideation' | 'pre_seed' | 'early_stage' | 'scaling_stage' | 'mature_startup'
  label: string;           // Display name
  totalPossible: number;   // Default: 100
}

export interface ScoreDependency {
  id: string;              // Unique ID for drag/drop
  nodeId: string;
  nodeLabel: string;
  workflowId?: string;
  workflowName?: string;
  jsonPath: string;        // e.g., "score" or custom path
  stage: string;           // Which stage this score belongs to
}

// SSOT Map mode types for Transformation nodes
export interface SSOTMapDependency {
  id: string;              // Unique ID for drag/drop
  nodeId: string;          // Source node ID
  nodeLabel: string;       // Display label
  workflowId?: string;     // Cross-workflow support
  workflowName?: string;
  jsonPath: string;        // e.g., "score" or "data.company_name"
  targetDomain: string;    // e.g., "leadership"
  targetFieldKey: string;  // e.g., "domain_score"
  targetFieldName?: string; // Display name for UI
}

export interface VariableConfig {
  name: string;
  type: "string" | "number" | "boolean" | "json";
  default: any;
  scope: "global" | "node";
  outputName?: string;
  dependencies?: string[]; // Deprecated, kept for migration
  promptParts?: PromptPart[];
  // Scoring Mode fields
  scoringMode?: boolean;
  scoreDependencies?: ScoreDependency[];
  stages?: ScoreStageConfig[];
  // SSOT Map Mode fields
  ssotMapMode?: boolean;
  ssotMapDependencies?: SSOTMapDependency[];
}

export interface FrameworkConfig {
  frameworkId?: string; // Reference to database framework
  name: string;
  description: string;
  schema: string | Record<string, any>;
  type: "rating_scale" | "rubric" | "criteria" | "custom" | "document";
  category?: string;
  workflow_association?: string;
  language?: string;
  score?: string;
}

export interface NoteConfig {
  text: string;
  fontSize: "small" | "medium" | "large" | "xlarge" | "xxlarge";
  labelFontSize?: "small" | "medium" | "large" | "xlarge" | "xxlarge";
  textAlign: "left" | "center" | "right";
  color: string;
}

export interface WorkflowConfig {
  workflowId: string;
  workflowName: string;
}

// Output Destination from database registry
export interface OutputDestination {
  id: string;
  name: string;
  destination_type: 'external_api' | 'internal_db' | 'webhook';
  profile: string;
  edge_function: string | null;
  color: string;
  icon: string | null;
  description: string | null;
  config_schema: Record<string, any>;
  is_active: boolean;
  sort_order: number;
}

// Node-level output destination configuration
export interface NodeOutputDestination {
  destination_id: string;
  destination_name?: string; // Cached for display
  enabled: boolean;
  field_mapping?: {
    domain?: string;
    field_key?: string;
    custom_field_name?: string;
  };
  // SSOT Update specific config (legacy - use AgentConfig instead)
  config?: {
    target_company_source?: 'current' | 'from_input';
    auto_approve_l4?: boolean;
    require_approval_create?: boolean;
  };
}

// ============= SSOT MAPPING NODE TYPES =============

export type AgentExecutionType = 'ssot_update' | 'webhook' | 'custom';

// Mapping mode: schema (create fields only) vs data (write to existing fields only)
export type MappingMode = 'schema' | 'data';

export interface SSOTAgentConfig {
  mode: MappingMode;  // Replaces schema_only boolean
  target_company_source: 'current' | 'from_input';
  auto_approve_l4: boolean;
  require_approval_create: boolean;
  // Legacy field - kept for backward compatibility during migration
  schema_only?: boolean;
}

export interface AgentConfig {
  executionType: AgentExecutionType;
  // Dependency selection (which node's output to use)
  sourceNodeId?: string;
  sourceNodeLabel?: string;
  // SSOT Mapping specific settings
  ssotConfig?: SSOTAgentConfig;
  // Future: webhook config, custom execution, etc.
  webhookConfig?: {
    url?: string;
    method?: 'POST' | 'PUT' | 'PATCH';
    headers?: Record<string, string>;
  };
}

export interface IntegrationConfig {
  integrationId: string;       // e.g., 'firecrawl'
  integrationName: string;     // Display name
  capability: string;          // e.g., 'scrape', 'search', 'map', 'crawl'
  options?: Record<string, any>; // Capability-specific options
  promptParts?: PromptPart[];  // Input from dependencies
  outputName?: string;
}

export interface EvaluationMetric {
  score: number;        // 0-100 (lower is better)
  reasoning: string;
}

export interface NodeImprovementData {
  nodeId: string;
  // New evaluation scores (0-100, lower is better)
  hallucinationScore?: number;
  hallucinationReasoning?: string;
  dataQualityScore?: number;
  dataQualityReasoning?: string;
  complexityScore?: number;
  complexityReasoning?: string;
  // Aggregate
  overallScore?: number;           // Weighted average for heatmap (0-100, lower is better)
  evaluatedAt?: string;
  flags?: string[];                // Quality flags like HIGH_HALLUCINATION
  // Legacy (for backward compatibility)
  accuracy?: number;               // Maps to 100 - hallucinationScore
  hallucinations?: number;         // Direct map to hallucinationScore
  grading?: number;                // Maps to 100 - dataQualityScore
  heatmapScore?: number;           // Maps to 100 - overallScore (for display)
  solutions?: string[];            // Generated from reasoning
}

export interface NodePerformanceData {
  nodeId: string;
  // Token metrics
  avgTokens?: number;           // Average total tokens per generation
  avgPromptTokens?: number;     // Average prompt (input) tokens
  avgOutputTokens?: number;     // Average completion tokens
  maxOutputTokensSeen?: number; // Maximum completion tokens seen
  thresholdPercent?: number;    // Average % of model's max output used
  atMaxCount?: number;          // How many generations hit the max
  totalGenerations?: number;    // Total number of generations
  // Speed metrics
  avgSpeedMs?: number;          // Average execution time
  maxSpeedMs?: number;          // Slowest execution
  minSpeedMs?: number;          // Fastest execution
  speedScore?: number;          // 0-100 (0 = fast, 100 = slow)
  // Cost metrics
  avgCost?: number;             // Average cost per generation
  totalCost?: number;           // Total cost for this node
  costScore?: number;           // 0-100 (0 = cheap, 100 = expensive)
  // Model info
  configuredModel?: string;     // What's configured
  lastExecutedModel?: string;   // What was actually used
  modelMismatch?: boolean;      // Config vs execution mismatch
  // For model switching analysis
  modelThreshold?: number;      // Current model's max output tokens
  // Overall
  overallScore?: number;        // 0-100 composite (0 = healthy, 100 = problematic)
  suggestions?: string[];       // Optimization suggestions
}
