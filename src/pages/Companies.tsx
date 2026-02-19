import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Company } from '@/types/company';
import { SubmissionDataViewer } from '@/components/companies/SubmissionDataViewer';
import { InitialSubmissionViewer } from '@/components/companies/InitialSubmissionViewer';
import { AddSubmissionDialog } from '@/components/companies/AddSubmissionDialog';
import { OutputDataViewer } from '@/components/companies/OutputDataViewer';
import { QualityWarningsSection } from '@/components/companies/QualityWarningsSection';
import { MasterDataViewer } from '@/components/companies/MasterDataViewer';
import { SSOTChangeReviewDialog } from '@/components/companies/SSOTChangeReviewDialog';
import { AbiSyncLogCard } from '@/components/companies/AbiSyncLogCard';
import { SSOTPendingChange } from '@/types/ssot-changes';
import { EntitiesTab } from '@/components/entities/EntitiesTab';
import { Submission } from '@/lib/submissionUtils';
import { formatCost } from '@/lib/modelRegistry';
import { CompanyDomain } from '@/types/company-master';
import {
  Plus,
  Upload,
  Building2,
  RefreshCw,
  Copy,
  Eye,
  EyeOff,
  MoreHorizontal,
  Trash2,
  Settings,
  Search,
  Database,
  Layers,
  ChevronDown,
  ChevronRight,
  Play,
  Loader2,
  CheckCircle2,
  Wand2,
  ArrowLeft,
  Send,
  Globe,
  DollarSign,
  RotateCcw,
  Cloud,
  AlertTriangle,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
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
import { format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

// Default field names for tab-separated data
const DEFAULT_FIELDS = [
  'first_name',
  'last_name',
  'id',
  'email',
  'company_name',
  'company_description',
  'vision_mission',
  'state',
  'industry',
  'problem_statement',
  'solution',
  'additional_info'
];

// Intelligently parse any input to JSON
const parseToJson = (input: string, fieldNames: string[]): { data: any; format: string } | null => {
  const trimmed = input.trim();
  
  if (!trimmed) return null;

  // 1. Try parsing as JSON first
  try {
    const parsed = JSON.parse(trimmed);
    return { data: parsed, format: 'json' };
  } catch {
    // Not valid JSON, continue to other formats
  }

  // 2. Check for tab-separated values (single row with tabs)
  if (trimmed.includes('\t')) {
    const values = trimmed.split('\t').map(v => v.trim());
    const result: Record<string, string> = {};
    
    values.forEach((value, index) => {
      const fieldName = fieldNames[index] || `field_${index + 1}`;
      if (value) {
        result[fieldName] = value;
      }
    });
    
    return { data: result, format: 'tab-separated' };
  }

  // 3. Check for key:value or key=value pairs (one per line)
  const lines = trimmed.split('\n').filter(l => l.trim());
  const keyValuePattern = /^([^:=]+)[=:](.+)$/;
  const kvMatches = lines.filter(l => keyValuePattern.test(l.trim()));
  
  if (kvMatches.length > 0 && kvMatches.length >= lines.length * 0.5) {
    const result: Record<string, string> = {};
    lines.forEach(line => {
      const match = line.trim().match(keyValuePattern);
      if (match) {
        const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
        const value = match[2].trim();
        result[key] = value;
      }
    });
    return { data: result, format: 'key-value' };
  }

  // 4. Check for comma-separated values
  if (trimmed.includes(',') && !trimmed.includes('\n')) {
    const values = trimmed.split(',').map(v => v.trim());
    const result: Record<string, string> = {};
    
    values.forEach((value, index) => {
      const fieldName = fieldNames[index] || `field_${index + 1}`;
      if (value) {
        result[fieldName] = value;
      }
    });
    
    return { data: result, format: 'comma-separated' };
  }

  // 5. Multi-line text - treat as content with line breaks
  if (lines.length > 1) {
    return { 
      data: { 
        content: trimmed,
        lines: lines 
      }, 
      format: 'multi-line' 
    };
  }

  // 6. Single text value - wrap in object
  return { 
    data: { content: trimmed }, 
    format: 'text' 
  };
};

const getFormatLabel = (format: string | null) => {
  switch (format) {
    case 'json': return 'JSON';
    case 'tab-separated': return 'Tab-separated';
    case 'key-value': return 'Key-value pairs';
    case 'comma-separated': return 'Comma-separated';
    case 'multi-line': return 'Multi-line text';
    case 'text': return 'Plain text';
    default: return 'Unknown';
  }
};

// Submission interface is now imported from @/lib/submissionUtils

interface NodeData {
  id: string;
  company_id: string;
  workflow_id: string;
  node_id: string;
  node_type: string;
  node_label: string | null;
  data: { output?: any } | null;
  content_hash: string | null;
  last_executed_at: string | null;
  version: number | null;
}

interface MasterDataField {
  id: string;
  company_id: string;
  domain: CompanyDomain;
  field_key: string;
  field_value: unknown;
  field_type: string | null;
  confidence_score: number | null;
  source_type: string;
  source_reference: unknown;
  is_verified: boolean | null;
  verified_by: string | null;
  verified_at: string | null;
  version: number;
  created_at: string | null;
  updated_at: string | null;
}

interface DomainDef {
  domain: CompanyDomain;
  display_name: string;
  description: string | null;
  icon_name: string | null;
  sort_order: number | null;
  color: string | null;
}

interface CompanyCostSummary {
  company_id: string;
  total_cost: number;
  generation_count: number;
}

export default function Companies() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [companies, setCompanies] = useState<Company[]>([]);
const [workflows, setWorkflows] = useState<{ id: string; name: string; settings?: unknown; parent_id?: string | null }[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDetailView, setShowDetailView] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [visibleApiKeys, setVisibleApiKeys] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(false);
  const [nodeData, setNodeData] = useState<NodeData[]>([]);
  const [nodeDataLoading, setNodeDataLoading] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState('details');
  const [mainView, setMainView] = useState<'companies' | 'entities'>('companies');
  const [outputTab, setOutputTab] = useState<'abi' | 'abivc'>('abi');
  const [showAddSubmissionDialog, setShowAddSubmissionDialog] = useState(false);
  const [submissionToEdit, setSubmissionToEdit] = useState<Submission | null>(null);
  const [runningWorkflows, setRunningWorkflows] = useState(false);
  const [runningAllCompanies, setRunningAllCompanies] = useState(false);
  const [showBulkConfirmDialog, setShowBulkConfirmDialog] = useState<'all' | 'empty' | null>(null);
  const [nodeConfigLookup, setNodeConfigLookup] = useState<Map<string, any>>(new Map());
  const [masterData, setMasterData] = useState<MasterDataField[]>([]);
  const [masterDataLoading, setMasterDataLoading] = useState(false);
  const [domainDefinitions, setDomainDefinitions] = useState<DomainDef[]>([]);
  const [fieldDefinitions, setFieldDefinitions] = useState<{
    id: string;
    domain: CompanyDomain;
    field_key: string;
    display_name: string;
    field_type: string;
    sort_order: number | null;
    level: 'L1' | 'L1C' | 'L2' | 'L3' | 'L4' | null;
    parent_field_id: string | null;
    is_scored: boolean | null;
  }[]>([]);
  const [domainScores, setDomainScores] = useState<{
    domain: CompanyDomain;
    score: number | null;
    confidence: number | null;
  }[]>([]);
  const [contextFacts, setContextFacts] = useState<Record<CompanyDomain, Array<{
    id: string;
    company_id: string;
    fact_key: string;
    display_name: string;
    fact_value: unknown;
    fact_type: string;
    category: 'attribute' | 'constraint' | 'segment';
    source_type: string;
    source_reference: unknown;
    is_verified: boolean;
    verified_by: string | null;
    verified_at: string | null;
    version: number;
    created_at: string;
    updated_at: string;
  }>>>({} as Record<CompanyDomain, Array<any>>);
  const [companyCosts, setCompanyCosts] = useState<Map<string, CompanyCostSummary>>(new Map());
  const [selectedCompanyCost, setSelectedCompanyCost] = useState<CompanyCostSummary | null>(null);
  const { toast } = useToast();

  // Form state for new company
  const [newCompany, setNewCompany] = useState({
    name: '',
    slug: '',
    contact_email: '',
    initial_data: '',
    custom_fields: DEFAULT_FIELDS.join(', '),
  });
  const [parsedInitialData, setParsedInitialData] = useState<any>(null);
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);
  const [showDataPreview, setShowDataPreview] = useState(false);
  const [isCreatingCompany, setIsCreatingCompany] = useState(false);
  
  // SSOT Change Review state
  const [pendingChangeForReview, setPendingChangeForReview] = useState<SSOTPendingChange | null>(null);
  const [showChangeReviewDialog, setShowChangeReviewDialog] = useState(false);
  
  // Master Data Reset state
  const [showResetConfirmDialog, setShowResetConfirmDialog] = useState(false);
  const [resettingMasterData, setResettingMasterData] = useState(false);
  
  // SSOT Sync to Abi state
  const [syncingToAbi, setSyncingToAbi] = useState(false);
  
  // Only use Master SSOT state
  const [enforceSchema, setEnforceSchema] = useState(true);
  const [showCleanOrphansDialog, setShowCleanOrphansDialog] = useState(false);
  const [cleaningOrphans, setCleaningOrphans] = useState(false);
  
  // Sync history refresh trigger
  const [syncRefreshTrigger, setSyncRefreshTrigger] = useState(0);
  
  // Calculate orphan fields (data that doesn't exist in schema)
  const orphanFields = masterData.filter(field => {
    const schemaMatch = fieldDefinitions.find(
      def => def.domain === field.domain && def.field_key === field.field_key
    );
    return !schemaMatch;
  });
  
  // Handler to clean orphan data
  const handleCleanOrphanData = async () => {
    if (!selectedCompany || orphanFields.length === 0) return;
    
    setCleaningOrphans(true);
    try {
      const orphanIds = orphanFields.map(f => f.id);
      
      const { error } = await supabase
        .from('company_master_data')
        .delete()
        .in('id', orphanIds);
      
      if (error) throw error;
      
      // Refresh data
      await fetchMasterData(selectedCompany.id);
      
      toast({
        title: "Orphan Data Cleaned",
        description: `${orphanIds.length} field${orphanIds.length !== 1 ? 's' : ''} not in Master Schema have been removed.`,
      });
    } catch (error) {
      console.error('Clean orphan data error:', error);
      toast({
        title: "Cleanup Failed",
        description: "Could not clean orphan data. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setCleaningOrphans(false);
      setShowCleanOrphansDialog(false);
    }
  };
  
  // Handler to reset master data to defaults
  const handleResetMasterData = async () => {
    if (!selectedCompany) return;
    
    setResettingMasterData(true);
    try {
      // 1. Delete existing master data for this company
      const { error: masterError } = await supabase
        .from('company_master_data')
        .delete()
        .eq('company_id', selectedCompany.id);
      
      if (masterError) throw masterError;
      
      // 2. Delete related history
      const { error: historyError } = await supabase
        .from('company_master_data_history')
        .delete()
        .eq('company_id', selectedCompany.id);
      
      if (historyError) console.warn('Could not delete history:', historyError);
      
      // 3. Delete context facts
      const { error: factsError } = await supabase
        .from('company_context_facts')
        .delete()
        .eq('company_id', selectedCompany.id);
      
      if (factsError) console.warn('Could not delete context facts:', factsError);
      
      // 4. Refresh data
      await fetchMasterData(selectedCompany.id);
      await fetchContextFacts(selectedCompany.id);
      await fetchDomainScores(selectedCompany.id);
      
      toast({
        title: "Master Data Reset",
        description: "All SSOT data has been cleared. Run workflows to repopulate.",
      });
    } catch (error) {
      console.error('Reset master data error:', error);
      toast({
        title: "Reset Failed",
        description: "Could not reset master data. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setResettingMasterData(false);
      setShowResetConfirmDialog(false);
    }
  };

  // Handler to sync SSOT to Abi
  const handleSyncToAbi = async () => {
    if (!selectedCompany) return;
    
    setSyncingToAbi(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-ssot-to-abi', {
        body: {
          company_id: selectedCompany.id,
          sync_type: 'full',
          enforce_schema: enforceSchema,
          triggered_by: 'manual'
        }
      });
      
      if (error) throw error;
      
      // Refresh sync history
      setSyncRefreshTrigger(prev => prev + 1);
      
      if (data.skipped) {
        toast({
          title: "Sync Skipped",
          description: data.reason || "SSOT sync is not configured",
        });
      } else if (data.success) {
        const filterNote = enforceSchema && data.filtered_count ? ` (${data.filtered_count} orphan fields filtered out)` : '';
        toast({
          title: "Synced to Abi",
          description: `${data.fields_synced} fields and ${data.context_facts_synced} context facts synced successfully.${filterNote}`,
        });
      } else {
        throw new Error(data.error || 'Sync failed');
      }
    } catch (error) {
      console.error('Sync to Abi error:', error);
      // Still refresh to show failed sync in log
      setSyncRefreshTrigger(prev => prev + 1);
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Could not sync to Abi. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setSyncingToAbi(false);
    }
  };

  // Parse initial data whenever it changes
  useEffect(() => {
    if (!newCompany.initial_data.trim()) {
      setParsedInitialData(null);
      setDetectedFormat(null);
      return;
    }

    const fieldNames = newCompany.custom_fields.split(',').map(f => f.trim()).filter(Boolean);
    const result = parseToJson(newCompany.initial_data, fieldNames.length > 0 ? fieldNames : DEFAULT_FIELDS);
    
    if (result) {
      setParsedInitialData(result.data);
      setDetectedFormat(result.format);
    } else {
      setParsedInitialData(null);
      setDetectedFormat(null);
    }
  }, [newCompany.initial_data, newCompany.custom_fields]);

  const fetchSubmissions = async (companyId: string) => {
    try {
      setSubmissionsLoading(true);
      const { data, error } = await supabase
        .from('company_data_submissions')
        .select('*')
        .eq('company_id', companyId)
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setSubmissions((data || []) as Submission[]);
    } catch (error) {
      console.error('Error fetching submissions:', error);
    } finally {
      setSubmissionsLoading(false);
    }
  };

  const fetchNodeData = async (companyId: string) => {
    try {
      setNodeDataLoading(true);
      const { data, error } = await supabase
        .from('company_node_data')
        .select('*')
        .eq('company_id', companyId)
        .order('workflow_id')
        .order('last_executed_at', { ascending: false });

      if (error) throw error;
      setNodeData((data || []) as NodeData[]);
      
      // Also fetch workflow definitions to build node config lookup
      const workflowIds = [...new Set((data || []).map(n => n.workflow_id))];
      if (workflowIds.length > 0) {
        const { data: workflowsData } = await supabase
          .from('workflows')
          .select('id, nodes')
          .in('id', workflowIds);
        
        // Build lookup for node configs
        const lookup = new Map<string, any>();
        workflowsData?.forEach(wf => {
          const nodes = wf.nodes as any[];
          nodes?.forEach(node => {
            lookup.set(`${wf.id}:${node.id}`, node.config || {});
          });
        });
        setNodeConfigLookup(lookup);
      }
    } catch (error) {
      console.error('Error fetching node data:', error);
    } finally {
      setNodeDataLoading(false);
    }
  };

  const fetchMasterData = async (companyId: string) => {
    try {
      setMasterDataLoading(true);
      const { data, error } = await supabase
        .from('company_master_data')
        .select('*')
        .eq('company_id', companyId)
        .order('domain')
        .order('field_key');

      if (error) throw error;
      setMasterData((data || []) as MasterDataField[]);
    } catch (error) {
      console.error('Error fetching master data:', error);
    } finally {
      setMasterDataLoading(false);
    }
  };

  const fetchDomainDefinitions = async () => {
    try {
      const { data, error } = await supabase
        .from('company_domain_definitions')
        .select('*')
        .order('sort_order');

      if (error) throw error;
      setDomainDefinitions((data || []) as DomainDef[]);
    } catch (error) {
      console.error('Error fetching domain definitions:', error);
    }
  };

  const fetchFieldDefinitions = async () => {
    try {
      const { data, error } = await supabase
        .from('company_field_definitions')
        .select('id, domain, field_key, display_name, field_type, sort_order, level, parent_field_id, is_scored')
        .order('domain')
        .order('level')
        .order('sort_order');

      if (error) throw error;
      setFieldDefinitions(data || []);
    } catch (error) {
      console.error('Error fetching field definitions:', error);
    }
  };

  const fetchDomainScores = async (companyId: string) => {
    try {
      const { data, error } = await supabase
        .from('company_domain_scores')
        .select('domain, score, confidence')
        .eq('company_id', companyId);

      if (error) throw error;
      setDomainScores((data || []) as { domain: CompanyDomain; score: number | null; confidence: number | null }[]);
    } catch (error) {
      console.error('Error fetching domain scores:', error);
    }
  };

  const fetchContextFacts = async (companyId: string) => {
    try {
      // Fetch context facts with their domain references
      const { data: facts, error: factsError } = await supabase
        .from('company_context_facts')
        .select('*')
        .eq('company_id', companyId);

      if (factsError) throw factsError;

      // Fetch domain references for these facts
      const factIds = (facts || []).map(f => f.id);
      if (factIds.length === 0) {
        setContextFacts({} as Record<CompanyDomain, any[]>);
        return;
      }

      const { data: refs, error: refsError } = await supabase
        .from('domain_context_references')
        .select('fact_id, domain')
        .in('fact_id', factIds);

      if (refsError) throw refsError;

      // Build lookup: fact_id -> domains
      const factDomains = new Map<string, CompanyDomain[]>();
      (refs || []).forEach(ref => {
        if (!factDomains.has(ref.fact_id)) factDomains.set(ref.fact_id, []);
        factDomains.get(ref.fact_id)!.push(ref.domain as CompanyDomain);
      });

      // Group facts by domain - Overview gets ALL facts (roll-up view)
      const byDomain: Record<CompanyDomain, any[]> = {} as Record<CompanyDomain, any[]>;
      
      // Always add ALL facts to overview (roll-up)
      byDomain['overview'] = [...(facts || [])];
      
      // Also add to their specific assigned domains
      (facts || []).forEach(fact => {
        const domains = factDomains.get(fact.id) || [];
        domains.forEach(domain => {
          // Skip 'overview' since we already added all facts there
          if (domain !== 'overview') {
            if (!byDomain[domain]) byDomain[domain] = [];
            byDomain[domain].push(fact);
          }
        });
      });

      setContextFacts(byDomain);
    } catch (error) {
      console.error('Error fetching context facts:', error);
    }
  };

  const fetchCompanyCosts = async () => {
    try {
      const { data, error } = await supabase.rpc('get_company_cost_summaries');
      
      if (error) throw error;
      
      const costMap = new Map<string, CompanyCostSummary>();
      (data || []).forEach((row: { company_id: string; total_cost: number; generation_count: number }) => {
        costMap.set(row.company_id, {
          company_id: row.company_id,
          total_cost: Number(row.total_cost) || 0,
          generation_count: Number(row.generation_count) || 0,
        });
      });
      setCompanyCosts(costMap);
    } catch (error) {
      console.error('Error fetching company costs:', error);
    }
  };

  const fetchSelectedCompanyCost = async (companyId: string) => {
    try {
      const { data, error } = await supabase
        .from('ai_usage_logs')
        .select('estimated_cost')
        .eq('company_id', companyId);
      
      if (error) throw error;
      
      const totalCost = (data || []).reduce((sum, row) => sum + (Number(row.estimated_cost) || 0), 0);
      const generationCount = data?.length || 0;
      
      setSelectedCompanyCost({
        company_id: companyId,
        total_cost: totalCost,
        generation_count: generationCount,
      });
    } catch (error) {
      console.error('Error fetching selected company cost:', error);
    }
  };

  const toggleNodeExpanded = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  const handleRunAllWorkflows = async (companyId: string, emptyOnly: boolean = false, force: boolean = false) => {
    try {
      setRunningWorkflows(true);
      
      // Create a placeholder submission to trigger workflow execution
      const triggerType = force ? 'force_rerun' : (emptyOnly ? 'manual_run_empty' : 'manual_run');
      const { data: newSubmission, error: submissionError } = await supabase
        .from('company_data_submissions')
        .insert({
          company_id: companyId,
          raw_data: { _trigger: triggerType, timestamp: new Date().toISOString(), force },
          source_type: 'manual',
          status: 'pending',
        })
        .select()
        .single();

      if (submissionError) throw submissionError;

      // Call the edge function to run all workflows
      const { data, error } = await supabase.functions.invoke('run-company-workflows', {
        body: {
          company_id: companyId,
          submission_id: newSubmission.id,
          empty_only: emptyOnly,
          force,
        },
      });

      if (error) throw error;

      console.log('[handleRunAllWorkflows] Result:', data);

      const title = force ? 'Force re-run complete' : (emptyOnly ? 'Empty workflows executed' : 'Workflows executed');
      toast({
        title,
        description: `Processed ${data?.workflows_processed || 0} workflow(s). ${data?.debug ? `Found ${data.debug.total_workflows_fetched} total workflows.` : ''}`,
      });

      // Refresh data
      fetchNodeData(companyId);
      fetchSubmissions(companyId);
      fetchMasterData(companyId);
      fetchFieldDefinitions();
    } catch (error: any) {
      console.error('Error running workflows:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to run workflows',
        variant: 'destructive',
      });
    } finally {
      setRunningWorkflows(false);
    }
  };

  const handleRunAllWorkflowsForAllCompanies = async (emptyOnly: boolean) => {
    try {
      setRunningAllCompanies(true);
      
      toast({
        title: 'Running workflows',
        description: `Processing ${emptyOnly ? 'empty' : 'all'} workflows for ${companies.length} companies...`,
      });

      // Call the edge function with all_companies flag
      const { data, error } = await supabase.functions.invoke('run-company-workflows', {
        body: {
          all_companies: true,
          empty_only: emptyOnly,
        },
      });

      if (error) throw error;

      console.log('[handleRunAllWorkflowsForAllCompanies] Result:', data);

      const successCount = data?.results?.filter((r: any) => r.status === 'completed').length || 0;
      const errorCount = data?.results?.filter((r: any) => r.status === 'error').length || 0;

      toast({
        title: 'Bulk execution complete',
        description: `Processed ${data?.total_workflows_processed || 0} workflow(s) across ${successCount} companies. ${errorCount > 0 ? `${errorCount} companies had errors.` : ''}`,
      });

      // Refresh data if we have a selected company
      if (selectedCompany) {
        fetchNodeData(selectedCompany.id);
        fetchSubmissions(selectedCompany.id);
      }
    } catch (error: any) {
      console.error('Error running workflows for all companies:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to run workflows for all companies',
        variant: 'destructive',
      });
    } finally {
      setRunningAllCompanies(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCompanies((data || []) as Company[]);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast({
        title: 'Error',
        description: 'Failed to load companies',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkflows = async () => {
    try {
      const { data, error } = await supabase
        .from('workflows')
        .select('id, name, settings, parent_id')
        .order('name');

      if (error) throw error;
      setWorkflows((data || []) as { id: string; name: string; settings?: unknown; parent_id?: string | null }[]);
    } catch (error) {
      console.error('Error fetching workflows:', error);
    }
  };

  // Get workflows that have company-relevant data attribution and have node data
  const getCompanyRelevantWorkflows = () => {
    const workflowIdsWithNodes = new Set(nodeData.map(n => n.workflow_id));
    
    // Build a parent lookup for inheriting settings
    const workflowLookup = new Map(workflows.map(w => [w.id, w]));
    
    return workflows.filter(w => {
      // Check own settings first
      const settings = w.settings as { data_attribution?: string } | null | undefined;
      let attribution = settings?.data_attribution;
      
      // If no attribution and has parent, check parent's settings
      if (!attribution && w.parent_id) {
        const parent = workflowLookup.get(w.parent_id);
        const parentSettings = parent?.settings as { data_attribution?: string } | null | undefined;
        attribution = parentSettings?.data_attribution;
      }
      
      // Default to 'company_data' if still not set
      attribution = attribution || 'company_data';
      
      const isCompanyRelevant = attribution === 'company_data' || attribution === 'company_related_data';
      return isCompanyRelevant && workflowIdsWithNodes.has(w.id);
    });
  };
  
  // Get display name for workflow with parent prefix
  const getWorkflowDisplayName = (workflow: { id: string; name: string; parent_id?: string | null }) => {
    if (workflow.parent_id) {
      const parent = workflows.find(w => w.id === workflow.parent_id);
      if (parent) {
        return `${parent.name} → ${workflow.name}`;
      }
    }
    return workflow.name;
  };

  useEffect(() => {
    fetchCompanies();
    fetchWorkflows();
    fetchDomainDefinitions();
    fetchFieldDefinitions();
    fetchCompanyCosts();
  }, []);

  // Auto-refresh master data when switching to the masterData tab
  useEffect(() => {
    if (activeTab === 'masterData' && selectedCompany) {
      fetchMasterData(selectedCompany.id);
      fetchDomainScores(selectedCompany.id);
      fetchContextFacts(selectedCompany.id);
      fetchFieldDefinitions();
    }
  }, [activeTab, selectedCompany?.id]);

  // Handle pending_change URL parameter for SSOT review flow
  useEffect(() => {
    const pendingChangeId = searchParams.get('pending_change');
    if (!pendingChangeId) return;

    const fetchPendingChange = async () => {
      try {
        const { data, error } = await supabase
          .from('ssot_pending_changes')
          .select('*')
          .eq('id', pendingChangeId)
          .maybeSingle();

        if (error) throw error;
        
        if (data) {
          // Find and select the company
          const company = companies.find(c => c.id === data.company_id);
          if (company) {
            setSelectedCompany(company);
            setShowDetailView(true);
            setActiveTab('master-data');
          }
          
          // Open the review dialog with this change
          setPendingChangeForReview(data as SSOTPendingChange);
          setShowChangeReviewDialog(true);
          
          // Clear the URL parameter to prevent re-triggering
          setSearchParams(prev => {
            prev.delete('pending_change');
            return prev;
          });
        }
      } catch (error) {
        console.error('Error fetching pending change:', error);
      }
    };

    // Wait for companies to load before processing
    if (companies.length > 0) {
      fetchPendingChange();
    }
  }, [searchParams, companies]);

  const handleAddCompany = async () => {
    setIsCreatingCompany(true);
    try {
      // Determine submission data - use parsed data if provided, otherwise placeholder
      let submissionData: any;
      let sourceType: string;
      
      if (parsedInitialData) {
        submissionData = parsedInitialData;
        sourceType = 'manual';
      } else {
        submissionData = { 
          _initialized: true, 
          company_name: newCompany.name,
          timestamp: new Date().toISOString() 
        };
        sourceType = 'auto_init';
      }

      // Step 1: Insert the company
      const { data: newCompanyData, error } = await supabase
        .from('companies')
        .insert({
          name: newCompany.name,
          slug: newCompany.slug.toLowerCase().replace(/\s+/g, '-'),
          contact_email: newCompany.contact_email || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Step 2: Create the submission with real data or placeholder
      const { data: submission, error: submissionError } = await supabase
        .from('company_data_submissions')
        .insert({
          company_id: newCompanyData.id,
          raw_data: submissionData,
          source_type: sourceType,
          status: 'processing',
          metadata: parsedInitialData ? {
            submitted_via: 'company_creation',
            detected_format: detectedFormat,
          } : null,
        })
        .select()
        .single();

      if (submissionError) {
        console.error('Error creating initial submission:', submissionError);
        throw submissionError;
      }

      // Step 3: Run all workflows for this company
      const { data: workflowResult, error: workflowError } = await supabase.functions.invoke(
        'run-company-workflows',
        {
          body: {
            company_id: newCompanyData.id,
            submission_id: submission.id,
          },
        }
      );

      if (workflowError) {
        console.error('Error running initial workflows:', workflowError);
        // Update submission to failed
        await supabase
          .from('company_data_submissions')
          .update({ status: 'failed', error_message: workflowError.message })
          .eq('id', submission.id);
      } else {
        console.log('Initial workflows executed:', workflowResult);
      }

      toast({
        title: 'Company created',
        description: `${newCompany.name} has been added. Processed ${workflowResult?.workflows_processed || 0} workflow(s).`,
      });

      setShowAddDialog(false);
      setNewCompany({ name: '', slug: '', contact_email: '', initial_data: '', custom_fields: DEFAULT_FIELDS.join(', ') });
      setParsedInitialData(null);
      setDetectedFormat(null);
      setShowDataPreview(false);
      fetchCompanies();
    } catch (error: any) {
      console.error('Error creating company:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create company',
        variant: 'destructive',
      });
    } finally {
      setIsCreatingCompany(false);
    }
  };

  const handleRegenerateApiKey = async (companyId: string) => {
    try {
      // Generate new API key
      const newApiKey = `org_${crypto.randomUUID().replace(/-/g, '')}`;

      const { error } = await supabase
        .from('companies')
        .update({ api_key: newApiKey })
        .eq('id', companyId);

      if (error) throw error;

      toast({
        title: 'API key regenerated',
        description: 'The new API key has been generated.',
      });

      fetchCompanies();
      // Update selected company if viewing detail
      if (selectedCompany && selectedCompany.id === companyId) {
        setSelectedCompany({ ...selectedCompany, api_key: newApiKey });
      }
    } catch (error) {
      console.error('Error regenerating API key:', error);
      toast({
        title: 'Error',
        description: 'Failed to regenerate API key',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteCompany = async (companyId: string) => {
    if (!confirm('Are you sure you want to delete this company? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase.from('companies').delete().eq('id', companyId);

      if (error) throw error;

      toast({
        title: 'Company deleted',
        description: 'The company has been removed.',
      });

      fetchCompanies();
    } catch (error) {
      console.error('Error deleting company:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete company',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateStatus = async (companyId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('companies')
        .update({ status })
        .eq('id', companyId);

      if (error) throw error;

      toast({
        title: 'Status updated',
        description: `Company status changed to ${status}.`,
      });

      fetchCompanies();
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    }
  };

  const handleAssignWorkflow = async (companyId: string, workflowId: string | null) => {
    try {
      const { error } = await supabase
        .from('companies')
        .update({ assigned_workflow_id: workflowId })
        .eq('id', companyId);

      if (error) throw error;

      toast({
        title: 'Workflow assigned',
        description: 'The company workflow has been updated.',
      });

      fetchCompanies();
      if (selectedCompany) {
        setSelectedCompany({ ...selectedCompany, assigned_workflow_id: workflowId });
      }
    } catch (error) {
      console.error('Error assigning workflow:', error);
      toast({
        title: 'Error',
        description: 'Failed to assign workflow',
        variant: 'destructive',
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Value copied to clipboard',
    });
  };

  const toggleApiKeyVisibility = (companyId: string) => {
    setVisibleApiKeys((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) {
        next.delete(companyId);
      } else {
        next.add(companyId);
      }
      return next;
    });
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      inactive: 'secondary',
      suspended: 'destructive',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const filteredCompanies = companies.filter(
    (company) =>
      company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.contact_email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openCompanyDetail = (company: Company) => {
    setSelectedCompany(company);
    setActiveTab('details');
    fetchSubmissions(company.id);
    fetchNodeData(company.id);
    fetchMasterData(company.id);
    fetchDomainScores(company.id);
    fetchContextFacts(company.id);
    fetchSelectedCompanyCost(company.id);
    setShowDetailView(true);
  };

  // Full-page company detail view
  if (showDetailView && selectedCompany) {
    return (
      <div className="flex flex-col h-full w-full bg-background">
        {/* Header with back button */}
        <div className="border-b px-6 py-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setShowDetailView(false)}
              className="mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to companies
            </Button>
            <div className="flex items-center gap-3">
              <Building2 className="h-6 w-6 text-muted-foreground" />
              <div>
                <h1 className="text-2xl font-bold">{selectedCompany.name}</h1>
                <p className="text-sm text-muted-foreground">{selectedCompany.slug}</p>
              </div>
              <div className="ml-4">
                {getStatusBadge(selectedCompany.status)}
              </div>
            </div>
          </div>

          {/* Main layout with sidebar */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 border-r bg-muted/30 p-4 flex flex-col overflow-hidden">
              <nav className="space-y-1 flex-1 overflow-y-auto min-h-0">
                <Button 
                  variant={activeTab === 'details' ? 'secondary' : 'ghost'} 
                  className="w-full justify-start"
                  onClick={() => setActiveTab('details')}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Details
                </Button>
                <Button 
                  variant={activeTab === 'submissions' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => setActiveTab('submissions')}
                >
                  <Database className="h-4 w-4 mr-2" />
                  Submissions
                  {submissions.filter(s => !s.raw_data._trigger).length > 0 && (
                    <Badge variant="outline" className="ml-auto">
                      {submissions.filter(s => !s.raw_data._trigger).length}
                    </Badge>
                  )}
                </Button>
                {/* Node Data - Collapsible with workflow pages */}
                <Collapsible 
                  open={activeTab === 'nodeData'} 
                  onOpenChange={(open) => {
                    if (open) {
                      setActiveTab('nodeData');
                      setSelectedWorkflowId(null);
                    }
                  }}
                >
                  <CollapsibleTrigger asChild>
                    <Button 
                      variant={activeTab === 'nodeData' ? 'secondary' : 'ghost'}
                      className="w-full justify-start"
                    >
                      <Layers className="h-4 w-4 mr-2" />
                      Node Data
                      {nodeData.length > 0 && (
                        <Badge variant="outline" className="ml-auto mr-1">
                          {nodeData.length}
                        </Badge>
                      )}
                      <ChevronDown className={`h-4 w-4 transition-transform ${activeTab === 'nodeData' ? 'rotate-180' : ''}`} />
                    </Button>
                  </CollapsibleTrigger>
                  
                  <CollapsibleContent className="ml-4 mt-1 space-y-1 max-h-64 overflow-y-auto">
                    {/* Show all option */}
                    <Button
                      variant={activeTab === 'nodeData' && selectedWorkflowId === null ? 'secondary' : 'ghost'}
                      size="sm"
                      className="w-full justify-start text-sm"
                      onClick={() => {
                        setActiveTab('nodeData');
                        setSelectedWorkflowId(null);
                      }}
                    >
                      <ChevronRight className="h-3 w-3 mr-2" />
                      All Pages
                      <Badge variant="outline" className="ml-auto text-xs">
                        {getCompanyRelevantWorkflows().reduce((sum, w) => 
                          sum + nodeData.filter(n => n.workflow_id === w.id).length, 0
                        )}
                      </Badge>
                    </Button>
                    
                    {getCompanyRelevantWorkflows().map(workflow => {
                      const workflowNodes = nodeData.filter(n => n.workflow_id === workflow.id);
                      const isChild = !!workflow.parent_id;
                      return (
                        <Button
                          key={workflow.id}
                          variant={selectedWorkflowId === workflow.id ? 'secondary' : 'ghost'}
                          size="sm"
                          className={`w-full justify-start ${isChild ? 'ml-3 text-xs' : 'text-sm'}`}
                          onClick={() => {
                            setActiveTab('nodeData');
                            setSelectedWorkflowId(workflow.id);
                          }}
                        >
                          <ChevronRight className={`mr-2 ${isChild ? 'h-2.5 w-2.5' : 'h-3 w-3'}`} />
                          {workflow.name}
                          <Badge variant="outline" className={`ml-auto ${isChild ? 'text-[10px]' : 'text-xs'}`}>
                            {workflowNodes.length}
                          </Badge>
                        </Button>
                      );
                    })}
                    
                    {getCompanyRelevantWorkflows().length === 0 && (
                      <div className="text-xs text-muted-foreground px-2 py-1">
                        No company-related pages with data
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>
                
                {/* Master Data */}
                <Button 
                  variant={activeTab === 'masterData' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => setActiveTab('masterData')}
                >
                  <Database className="h-4 w-4 mr-2" />
                  Master Data
                  {masterData.length > 0 && (
                    <Badge variant="outline" className="ml-auto">
                      {masterData.length}
                    </Badge>
                  )}
                </Button>
                
                {/* Output Data */}
                <Button 
                  variant={activeTab === 'outputData' ? 'secondary' : 'ghost'}
                  className="w-full justify-start"
                  onClick={() => setActiveTab('outputData')}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Output Data
                </Button>
              </nav>
            </aside>

            {/* Content area */}
            <main className="flex-1 p-6 overflow-auto">
              {/* Details Tab */}
              {activeTab === 'details' && (
                <div className="max-w-4xl">
                  {/* Quality Warnings */}
                  <QualityWarningsSection companyId={selectedCompany.id} />
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column */}
                    <div className="space-y-6">
                      {/* Status & Plan */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium">Status & Plan</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-center gap-4">
                            {getStatusBadge(selectedCompany.status)}
                            <Badge variant="outline">{selectedCompany.plan_tier} plan</Badge>
                          </div>
                        </CardContent>
                      </Card>

                      {/* API Key */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium">API Key</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center gap-2">
                            <code className="flex-1 bg-muted px-3 py-2 rounded text-sm font-mono truncate">
                              {visibleApiKeys.has(selectedCompany.id)
                                ? selectedCompany.api_key || 'Not generated'
                                : '••••••••••••••••••••••••••••••••'}
                            </code>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => toggleApiKeyVisibility(selectedCompany.id)}
                            >
                              {visibleApiKeys.has(selectedCompany.id) ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </Button>
                            {selectedCompany.api_key && (
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => copyToClipboard(selectedCompany.api_key!)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRegenerateApiKey(selectedCompany.id)}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Regenerate
                          </Button>
                        </CardContent>
                      </Card>

                      {/* Contact Email */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium">Contact Email</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-sm">
                            {selectedCompany.contact_email || (
                              <span className="text-muted-foreground">Not set</span>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      {/* Assigned Workflow */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium">Assigned Workflow</CardTitle>
                        </CardHeader>
                        <CardContent>
                          {selectedCompany.assigned_workflow_id ? (
                            <Badge variant="outline">
                              {workflows.find((w) => w.id === selectedCompany.assigned_workflow_id)?.name || 'Unknown'}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">None assigned</span>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-6">
                      {/* AI Usage & Cost */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            AI Usage & Cost
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs text-muted-foreground">Total Cost</Label>
                              <div className="font-medium text-lg">
                                {selectedCompanyCost 
                                  ? formatCost(selectedCompanyCost.total_cost) 
                                  : '—'}
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Generations</Label>
                              <div className="font-medium text-lg">
                                {selectedCompanyCost?.generation_count ?? '—'}
                              </div>
                            </div>
                          </div>
                          {selectedCompanyCost && selectedCompanyCost.generation_count > 0 && (
                            <div className="mt-3 pt-3 border-t">
                              <Label className="text-xs text-muted-foreground">Avg Cost/Generation</Label>
                              <div className="text-sm font-medium">
                                {formatCost(selectedCompanyCost.total_cost / selectedCompanyCost.generation_count)}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Rate Limits */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium">Usage Limits</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs text-muted-foreground">Rate Limit</Label>
                              <div className="font-medium">{selectedCompany.rate_limit_rpm} req/min</div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Storage Quota</Label>
                              <div className="font-medium">{selectedCompany.storage_quota_mb} MB</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Timestamps */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium">Timestamps</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <Label className="text-xs text-muted-foreground">Created</Label>
                              <div className="text-sm">{format(new Date(selectedCompany.created_at), 'MMM d, yyyy HH:mm')}</div>
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Updated</Label>
                              <div className="text-sm">{format(new Date(selectedCompany.updated_at), 'MMM d, yyyy HH:mm')}</div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Abi Sync Log */}
                      <AbiSyncLogCard 
                        companyId={selectedCompany.id} 
                        refreshTrigger={syncRefreshTrigger} 
                      />

                      {/* API Endpoint Info */}
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm font-medium">Data Ingestion Endpoint</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <p className="text-sm text-muted-foreground">
                            Send data to this endpoint with the company's API key
                          </p>
                          <code className="block bg-muted px-3 py-2 rounded text-xs font-mono break-all">
                            POST /functions/v1/ingest-data
                            <br />
                            Headers: X-API-Key: {'{'}api_key{'}'}
                          </code>
                        </CardContent>
                      </Card>

                      {/* Metadata */}
                      {selectedCompany.metadata && Object.keys(selectedCompany.metadata).length > 0 && (
                        <Card>
                          <CardHeader className="pb-3">
                            <CardTitle className="text-sm font-medium">Metadata</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <pre className="bg-muted p-3 rounded text-xs overflow-auto max-h-40">
                              {JSON.stringify(selectedCompany.metadata, null, 2)}
                            </pre>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Submissions Tab */}
              {activeTab === 'submissions' && (
                <InitialSubmissionViewer
                  submissions={submissions}
                  loading={submissionsLoading}
                  companyId={selectedCompany.id}
                  companyName={selectedCompany.name}
                  onEdit={(submission) => {
                    setSubmissionToEdit(submission);
                    setShowAddSubmissionDialog(true);
                  }}
                  onAdd={() => {
                    setSubmissionToEdit(null);
                    setShowAddSubmissionDialog(true);
                  }}
                />
              )}

              {/* Node Data Tab */}
              {activeTab === 'nodeData' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {selectedWorkflowId 
                        ? `Showing nodes from: ${getWorkflowDisplayName(workflows.find(w => w.id === selectedWorkflowId)!)}`
                        : 'Showing all company-relevant pages'}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button disabled={runningWorkflows}>
                          {runningWorkflows ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4 mr-2" />
                          )}
                          Run Workflows
                          <ChevronDown className="h-4 w-4 ml-2" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleRunAllWorkflows(selectedCompany.id, false, false)}>
                          <Play className="h-4 w-4 mr-2" />
                          Run All Workflows
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleRunAllWorkflows(selectedCompany.id, true, false)}>
                          <Wand2 className="h-4 w-4 mr-2" />
                          Run Empty Workflows Only
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleRunAllWorkflows(selectedCompany.id, false, true)}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Force Re-run All Workflows
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  {nodeDataLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (() => {
                    // Filter node data based on selection
                    const companyRelevantWorkflowIds = new Set(getCompanyRelevantWorkflows().map(w => w.id));
                    const filteredNodeData = selectedWorkflowId 
                      ? nodeData.filter(n => n.workflow_id === selectedWorkflowId)
                      : nodeData.filter(n => companyRelevantWorkflowIds.has(n.workflow_id));
                    
                    if (filteredNodeData.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Layers className="h-12 w-12 text-muted-foreground mb-4" />
                          <h3 className="font-medium">No node data yet</h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {getCompanyRelevantWorkflows().length === 0 
                              ? 'No pages with "Company Data" or "Company Related" settings found'
                              : 'Click "Run All Workflows" to initialize node outputs'}
                          </p>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-3">
                        {/* Group by workflow */}
                        {Object.entries(
                          filteredNodeData.reduce((acc, node) => {
                            if (!acc[node.workflow_id]) acc[node.workflow_id] = [];
                            acc[node.workflow_id].push(node);
                            return acc;
                          }, {} as Record<string, NodeData[]>)
                        ).map(([workflowId, nodes]) => {
                          const workflow = workflows.find(w => w.id === workflowId);
                          const workflowName = workflow ? getWorkflowDisplayName(workflow) : 'Unknown Workflow';
                          return (
                            <Card key={workflowId}>
                              <CardHeader className="py-3">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                  <Badge variant="outline" className="font-normal">
                                    {workflowName}
                                  </Badge>
                                  <span className="text-muted-foreground text-xs">
                                    {nodes.length} node{nodes.length !== 1 ? 's' : ''}
                                  </span>
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="pt-0 space-y-2">
                                {nodes.map((node) => (
                                  <Collapsible
                                    key={node.id}
                                    open={expandedNodes.has(node.id)}
                                    onOpenChange={() => toggleNodeExpanded(node.id)}
                                  >
                                    <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 hover:bg-muted rounded text-left">
                                      {expandedNodes.has(node.id) ? (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-sm truncate">
                                            {node.node_label || node.node_id}
                                          </span>
                                          <Badge variant="secondary" className="text-xs">
                                            {node.node_type}
                                          </Badge>
                                        </div>
                                        {node.last_executed_at && (
                                          <div className="text-xs text-muted-foreground">
                                            Last run: {format(new Date(node.last_executed_at), 'MMM d, yyyy HH:mm')}
                                          </div>
                                        )}
                                      </div>
                                      {node.version && (
                                        <Badge variant="outline" className="text-xs">
                                          v{node.version}
                                        </Badge>
                                      )}
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="px-6 pb-2">
                                      <div className="bg-muted rounded p-3 mt-2">
                                        <Label className="text-xs text-muted-foreground mb-1 block">Output</Label>
                                        <pre className="text-xs whitespace-pre-wrap break-all max-h-[200px] overflow-auto">
                                          {node.data?.output 
                                            ? (typeof node.data.output === 'string' 
                                                ? node.data.output 
                                                : JSON.stringify(node.data.output, null, 2))
                                            : 'No output'}
                                        </pre>
                                        {node.content_hash && (
                                          <div className="mt-2 pt-2 border-t">
                                            <span className="text-xs text-muted-foreground">
                                              Hash: {node.content_hash.substring(0, 16)}...
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    </CollapsibleContent>
                                  </Collapsible>
                                ))}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Master Data Tab */}
              {activeTab === 'masterData' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-4">
                      <h2 className="text-lg font-semibold">Master Data</h2>
                      
                      {/* Only use Master SSOT checkbox */}
                      <div className="flex items-center gap-2">
                        <Checkbox 
                          id="enforce-schema" 
                          checked={enforceSchema}
                          onCheckedChange={(checked) => setEnforceSchema(checked === true)}
                        />
                        <Label htmlFor="enforce-schema" className="text-sm font-normal cursor-pointer">
                          Only use Master SSOT
                        </Label>
                        {enforceSchema && orphanFields.length > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {orphanFields.length} orphan{orphanFields.length !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {/* Clean orphan data button - only when enforcing and orphans exist */}
                      {enforceSchema && orphanFields.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowCleanOrphansDialog(true)}
                          disabled={cleaningOrphans}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className={`h-4 w-4 mr-2 ${cleaningOrphans ? 'animate-spin' : ''}`} />
                          Clean Orphans
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowResetConfirmDialog(true)}
                        disabled={masterDataLoading || resettingMasterData}
                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                      >
                        <RotateCcw className={`h-4 w-4 mr-2 ${resettingMasterData ? 'animate-spin' : ''}`} />
                        Default Reset
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          fetchMasterData(selectedCompany.id);
                          fetchFieldDefinitions();
                          fetchDomainScores(selectedCompany.id);
                          fetchContextFacts(selectedCompany.id);
                        }}
                        disabled={masterDataLoading}
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${masterDataLoading ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleSyncToAbi}
                        disabled={syncingToAbi || masterDataLoading || masterData.length === 0}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        <Cloud className={`h-4 w-4 mr-2 ${syncingToAbi ? 'animate-pulse' : ''}`} />
                        {syncingToAbi ? 'Syncing...' : 'Sync to Abi'}
                      </Button>
                      <Badge variant="outline">
                        {masterData.length} field{masterData.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                  </div>
                  
                  {masterDataLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <MasterDataViewer 
                      masterData={masterData}
                      domainDefinitions={domainDefinitions}
                      fieldDefinitions={fieldDefinitions}
                      domainScores={domainScores}
                      contextFacts={contextFacts}
                    />
                  )}
                </div>
              )}

              {/* Output Data Tab */}
              {activeTab === 'outputData' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Output Data Preview</h2>
                    <div className="flex gap-2">
                      <Button
                        variant={outputTab === 'abi' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setOutputTab('abi')}
                      >
                        Abi Output
                      </Button>
                      <Button
                        variant={outputTab === 'abivc' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setOutputTab('abivc')}
                      >
                        AbiVC Output
                      </Button>
                    </div>
                  </div>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {outputTab === 'abi' ? 'Abi' : 'AbiVC'} Integration Data
                      </CardTitle>
                      <CardDescription>
                        Data from nodes marked as {outputTab === 'abi' ? 'Abi' : 'AbiVC'} outputs in workflow definitions
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {nodeDataLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <OutputDataViewer 
                          nodeData={nodeData}
                          nodeConfigLookup={nodeConfigLookup}
                          workflows={workflows}
                          outputType={outputTab}
                        />
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </main>
          </div>

          {/* Add/Edit Submission Dialog */}
          <AddSubmissionDialog
            open={showAddSubmissionDialog}
            onOpenChange={(open) => {
              setShowAddSubmissionDialog(open);
              if (!open) setSubmissionToEdit(null);
            }}
            companyId={selectedCompany.id}
            companyName={selectedCompany.name}
            workflows={workflows}
            existingSubmission={submissionToEdit || undefined}
            onSuccess={() => fetchSubmissions(selectedCompany.id)}
          />
          
          {/* Master Data Reset Confirmation Dialog */}
          <AlertDialog open={showResetConfirmDialog} onOpenChange={setShowResetConfirmDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Master Data to Defaults?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div>
                    <p>This will permanently delete all SSOT data for <strong>{selectedCompany?.name}</strong>, including:</p>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>All master data values ({masterData.length} fields)</li>
                      <li>All context facts</li>
                      <li>Field history records</li>
                    </ul>
                    <p className="mt-2">
                      The schema structure will remain intact. You can repopulate data by running workflows.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleResetMasterData}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  Reset to Defaults
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          
          {/* Clean Orphan Data Confirmation Dialog */}
          <AlertDialog open={showCleanOrphansDialog} onOpenChange={setShowCleanOrphansDialog}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clean Orphan Data?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div>
                    <p>This will permanently delete <strong>{orphanFields.length}</strong> field{orphanFields.length !== 1 ? 's' : ''} that are not defined in the Master SSOT schema:</p>
                    <ScrollArea className="max-h-[200px] mt-2">
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        {orphanFields.slice(0, 20).map((field) => (
                          <li key={field.id} className="text-muted-foreground">
                            <span className="font-medium">{field.field_key}</span>
                            <span className="text-xs ml-1">({field.domain})</span>
                          </li>
                        ))}
                        {orphanFields.length > 20 && (
                          <li className="text-muted-foreground italic">
                            ...and {orphanFields.length - 20} more
                          </li>
                        )}
                      </ul>
                    </ScrollArea>
                    <p className="mt-2 text-destructive">
                      This action cannot be undone.
                    </p>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction 
                  onClick={handleCleanOrphanData}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete Orphan Fields
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
      </div>
    );
  }

  // Company list view
  return (
    <div className="flex flex-col h-full w-full bg-background">
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
            {/* Header with Tabs */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold">Companies & Entities</h1>
              </div>
              
              <Tabs value={mainView} onValueChange={(v) => setMainView(v as 'companies' | 'entities')}>
                <div className="flex items-center justify-between">
                  <TabsList>
                    <TabsTrigger value="companies" className="gap-2">
                      <Building2 className="h-4 w-4" />
                      Companies
                    </TabsTrigger>
                    <TabsTrigger value="entities" className="gap-2">
                      <Globe className="h-4 w-4" />
                      Entities
                    </TabsTrigger>
                  </TabsList>
                  
                  {mainView === 'companies' && (
                    <div className="flex gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" disabled={runningAllCompanies || companies.length === 0}>
                            {runningAllCompanies ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4 mr-2" />
                            )}
                            Bulk Actions
                            <ChevronDown className="h-4 w-4 ml-2" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setShowBulkConfirmDialog('all')}>
                            <Play className="h-4 w-4 mr-2" />
                            Run All Workflows for All Companies
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setShowBulkConfirmDialog('empty')}>
                            <Wand2 className="h-4 w-4 mr-2" />
                            Run Empty Workflows for All Companies
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                        <DialogTrigger asChild>
                          <Button>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Company
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Add New Company</DialogTitle>
                            <DialogDescription>
                              Create a new company and optionally submit initial data to run all workflows
                            </DialogDescription>
                          </DialogHeader>

                          <div className="space-y-4 py-4">
                            {/* Company Details Section */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label htmlFor="name">Company Name</Label>
                                <Input
                                  id="name"
                                  value={newCompany.name}
                                  onChange={(e) =>
                                    setNewCompany({
                                      ...newCompany,
                                      name: e.target.value,
                                      slug: e.target.value.toLowerCase().replace(/\s+/g, '-'),
                                    })
                                  }
                                  placeholder="Acme Corp"
                                  disabled={isCreatingCompany}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor="slug">Slug</Label>
                                <Input
                                  id="slug"
                                  value={newCompany.slug}
                                  onChange={(e) =>
                                    setNewCompany({ ...newCompany, slug: e.target.value })
                                  }
                                  placeholder="acme-corp"
                                  disabled={isCreatingCompany}
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="email">Contact Email (optional)</Label>
                              <Input
                                id="email"
                                type="email"
                                value={newCompany.contact_email}
                                onChange={(e) =>
                                  setNewCompany({ ...newCompany, contact_email: e.target.value })
                                }
                                placeholder="contact@acme.com"
                                disabled={isCreatingCompany}
                              />
                            </div>

                            {/* Separator */}
                            <div className="relative py-2">
                              <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                              </div>
                              <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-background px-2 text-muted-foreground flex items-center gap-1">
                                  <Wand2 className="h-3 w-3" />
                                  Initial Company Data (optional)
                                </span>
                              </div>
                            </div>

                            {/* Field Names */}
                            <div className="space-y-2">
                              <Label htmlFor="field-names" className="text-sm">
                                Field Names <span className="text-muted-foreground text-xs">(for tab/comma-separated data)</span>
                              </Label>
                              <Input
                                id="field-names"
                                value={newCompany.custom_fields}
                                onChange={(e) => setNewCompany({ ...newCompany, custom_fields: e.target.value })}
                                placeholder="field1, field2, field3..."
                                className="text-sm"
                                disabled={isCreatingCompany}
                              />
                            </div>

                            {/* Data Input */}
                            <div className="space-y-2">
                              <Label htmlFor="initial-data" className="flex items-center gap-2">
                                Paste Your Data
                                {detectedFormat && (
                                  <span className="ml-2 text-xs font-normal text-green-600 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Detected: {getFormatLabel(detectedFormat)}
                                  </span>
                                )}
                              </Label>
                              <Textarea
                                id="initial-data"
                                value={newCompany.initial_data}
                                onChange={(e) => setNewCompany({ ...newCompany, initial_data: e.target.value })}
                                placeholder={`Paste data in any format:

• JSON: {"name": "value", ...}
• Tab-separated: value1    value2    value3
• Key-value: name: John, email: john@example.com
• Or leave empty to create without initial data`}
                                className="text-sm min-h-[140px] resize-y"
                                disabled={isCreatingCompany}
                              />
                            </div>

                            {/* Preview */}
                            {parsedInitialData && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label className="text-sm">Parsed Result</Label>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowDataPreview(!showDataPreview)}
                                    className="h-7 text-xs"
                                    type="button"
                                  >
                                    {showDataPreview ? (
                                      <>
                                        <EyeOff className="h-3 w-3 mr-1" />
                                        Hide Preview
                                      </>
                                    ) : (
                                      <>
                                        <Eye className="h-3 w-3 mr-1" />
                                        Show Preview
                                      </>
                                    )}
                                  </Button>
                                </div>
                                
                                {showDataPreview ? (
                                  <pre className="p-3 bg-muted rounded-lg text-xs font-mono overflow-x-auto max-h-[150px] overflow-y-auto">
                                    {JSON.stringify(parsedInitialData, null, 2)}
                                  </pre>
                                ) : (
                                  <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground">
                                    {Object.keys(parsedInitialData).length} field(s) detected. Click "Show Preview" to see the parsed JSON.
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          <DialogFooter>
                            <Button variant="outline" onClick={() => setShowAddDialog(false)} disabled={isCreatingCompany}>
                              Cancel
                            </Button>
                            <Button 
                              onClick={handleAddCompany} 
                              disabled={!newCompany.name || !newCompany.slug || isCreatingCompany}
                            >
                              {isCreatingCompany ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Creating & Running Workflows...
                                </>
                              ) : (
                                'Create Company'
                              )}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </div>

                <TabsContent value="companies" className="mt-4 space-y-6">

            {/* Bulk Confirm Dialog */}
            <AlertDialog open={!!showBulkConfirmDialog} onOpenChange={() => setShowBulkConfirmDialog(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {showBulkConfirmDialog === 'all' 
                      ? 'Run All Workflows for All Companies?' 
                      : 'Run Empty Workflows for All Companies?'}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This will execute {showBulkConfirmDialog === 'all' ? 'all' : 'empty'} workflows 
                    for {companies.length} companies. This may take some time and consume API credits.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => {
                    handleRunAllWorkflowsForAllCompanies(showBulkConfirmDialog === 'empty');
                    setShowBulkConfirmDialog(null);
                  }}>
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {/* Search */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search companies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Companies</CardDescription>
                  <CardTitle className="text-3xl">{companies.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Active</CardDescription>
                  <CardTitle className="text-3xl text-green-600">
                    {companies.filter((c) => c.status === 'active').length}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>With Workflows</CardDescription>
                  <CardTitle className="text-3xl text-primary">
                    {companies.filter((c) => c.assigned_workflow_id).length}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Inactive/Suspended</CardDescription>
                  <CardTitle className="text-3xl text-muted-foreground">
                    {companies.filter((c) => c.status !== 'active').length}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            {/* Companies Table */}
            <Card>
              <CardHeader>
                <CardTitle>All Companies</CardTitle>
                <CardDescription>
                  Click on a company to view details and manage their data
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredCompanies.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="font-medium text-lg">No companies yet</h3>
                    <p className="text-muted-foreground mt-1">
                      Add your first company to start processing data
                    </p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Company Name</TableHead>
                          <TableHead>AI Cost</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead className="w-[60px]"></TableHead>
                          <TableHead className="w-[60px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCompanies.map((company) => (
                          <TableRow key={company.id}>
                            <TableCell>
                              <span className="font-medium">{company.name}</span>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {companyCosts.get(company.id)
                                ? formatCost(companyCosts.get(company.id)!.total_cost)
                                : '—'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {format(new Date(company.created_at), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openCompanyDetail(company)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </TableCell>
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => handleRegenerateApiKey(company.id)}
                                  >
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                    Regenerate API Key
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleUpdateStatus(
                                        company.id,
                                        company.status === 'active' ? 'inactive' : 'active'
                                      )
                                    }
                                  >
                                    {company.status === 'active' ? 'Deactivate' : 'Activate'}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDeleteCompany(company.id)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
            </CardContent>
          </Card>
                </TabsContent>

                <TabsContent value="entities" className="mt-4">
                  <EntitiesTab />
                </TabsContent>
              </Tabs>
            </div>
        </div>
      </main>
      
      {/* SSOT Change Review Dialog */}
      <SSOTChangeReviewDialog
        open={showChangeReviewDialog}
        onOpenChange={setShowChangeReviewDialog}
        change={pendingChangeForReview}
        onChangeProcessed={() => {
          // Refresh master data AND field definitions after change is processed
          if (selectedCompany) {
            fetchMasterData(selectedCompany.id);
            fetchDomainScores(selectedCompany.id);
            fetchContextFacts(selectedCompany.id);
          }
          fetchFieldDefinitions(); // Refresh schema to show new SSOT fields
          setPendingChangeForReview(null);
          setShowChangeReviewDialog(false);
        }}
      />
    </div>
  );
}
