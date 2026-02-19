import { CheckCircle2, Play, Save, Loader2, Sparkles, Building2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWorkflowStore } from '@/store/workflowStore';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Progress } from '@/components/ui/progress';
import { getSaveState, type SaveState } from '@/hooks/useSaveOnEvent';

interface BottomBarProps {
  onValidate: () => void;
  validateButtonText?: string;
  isValidating?: boolean;
}

export function BottomBar({ onValidate, validateButtonText = 'Validate', isValidating = false }: BottomBarProps) {
  const { 
    workflow, 
    saveWorkflow, 
    isAIConversationOpen, 
    toggleAIConversation,
    companies,
    selectedCompanyId,
    setSelectedCompany,
    loadCompanies,
    forceRunCascade,
    isForceRunning,
    isSystemRunning,
    cascadeProgress,
    cancelCascade,
  } = useWorkflowStore();
  const [isSaving, setIsSaving] = useState(false);
  const [globalSaveState, setGlobalSaveState] = useState<SaveState>({ isSaving: false });

  // Subscribe to global save state changes (for auto-saves)
  useEffect(() => {
    const handleSaveStateChange = () => {
      setGlobalSaveState(getSaveState());
    };
    window.addEventListener('saveStateChanged', handleSaveStateChange);
    return () => window.removeEventListener('saveStateChanged', handleSaveStateChange);
  }, []);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { saveCurrentWorkflow } = await import('@/hooks/useSaveOnEvent');
      await saveCurrentWorkflow();
    } finally {
      setIsSaving(false);
    }
  };

  const handleCompanyChange = (companyId: string) => {
    const company = companies.find(c => c.id === companyId);
    if (company) {
      setSelectedCompany(company.id, company.name);
    }
  };

  const handleForceRun = async () => {
    const result = await forceRunCascade();
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleStopCascade = async () => {
    const subId = cascadeProgress?.submissionId;
    if (!subId) return;
    cancelCascade(subId);
    // Also update DB directly as fallback
    await supabase.from('company_data_submissions')
      .update({ status: 'failed', error_message: 'Cancelled by user' })
      .eq('id', subId);
    toast.success('Stopping cascade...');
  };

  // Determine if Force Run should be disabled
  const isNewWorkflow = workflow.id === '1' || workflow.id.startsWith('temp-');
  const canForceRun = !isNewWorkflow && !!selectedCompanyId && !isForceRunning;

  // Calculate progress percentage
  const progressPercent = cascadeProgress 
    ? Math.round((cascadeProgress.current / Math.max(1, cascadeProgress.total)) * 100)
    : 0;

  return (
    <div className="h-14 border-t border-border bg-card flex items-center justify-between px-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onValidate}
          disabled={isValidating}
          className="gap-2"
        >
          {isValidating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {validateButtonText}
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleForceRun}
                  disabled={!canForceRun}
                  className="gap-2 min-w-[120px]"
                >
                  {isForceRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {cascadeProgress ? `${cascadeProgress.current}/${cascadeProgress.total}` : 'Running...'}
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Force Run
                    </>
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {isNewWorkflow 
                ? 'Save the workflow first' 
                : !selectedCompanyId 
                  ? 'Select a company to force run' 
                  : 'Run workflow from the beginning (one node at a time)'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        
        
        {/* Progress bar during cascade */}
        {(isForceRunning || isSystemRunning) && cascadeProgress && (
          <div className="flex items-center gap-2 ml-2 min-w-0">
            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {isSystemRunning ? 'System Run:' : 'Force Run:'}
            </span>
            <Progress value={progressPercent} className="w-24 h-2" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {cascadeProgress.current}/{cascadeProgress.total}
            </span>
            {cascadeProgress.currentNodeLabel && (
              <span className="text-xs text-muted-foreground truncate max-w-[200px]" title={
                cascadeProgress.currentWorkflowName 
                  ? `${cascadeProgress.currentWorkflowName} > ${cascadeProgress.currentNodeLabel}`
                  : cascadeProgress.currentNodeLabel
              }>
                — "{cascadeProgress.currentNodeLabel}"
                {isSystemRunning && cascadeProgress.currentWorkflowName && (
                  <span className="text-muted-foreground/60"> ({cascadeProgress.currentWorkflowName})</span>
                )}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleStopCascade}
              className="text-destructive hover:text-destructive h-6 px-2"
            >
              <Square className="w-3 h-3 fill-current" />
            </Button>
          </div>
        )}
        
        <Select value={selectedCompanyId || ''} onValueChange={handleCompanyChange}>
          <SelectTrigger className="w-[160px] h-8 text-sm">
            <Building2 className="w-4 h-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Select company" />
          </SelectTrigger>
          <SelectContent>
            {companies.map((company) => (
              <SelectItem key={company.id} value={company.id}>
                {company.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3">
        {globalSaveState.isSaving && (
          <span className="text-sm text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Auto-saving...
          </span>
        )}
        {workflow.unsavedChanges && !globalSaveState.isSaving && (
          <span className="text-sm text-warning-foreground">Unsaved changes</span>
        )}
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!workflow.unsavedChanges || isSaving || globalSaveState.isSaving}
          className="gap-2"
        >
          {isSaving || globalSaveState.isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving || globalSaveState.isSaving ? 'Saving...' : 'Save'}
        </Button>
        <Button
          size="sm"
          onClick={toggleAIConversation}
          className={cn("gap-2", isAIConversationOpen && "bg-accent")}
        >
          <Sparkles className="w-4 h-4" />
          Automagic
        </Button>
      </div>
    </div>
  );
}
