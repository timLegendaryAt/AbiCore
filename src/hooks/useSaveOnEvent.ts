import { supabase } from '@/integrations/supabase/client';
import { useWorkflowStore } from '@/store/workflowStore';
import { useEffect, useRef } from 'react';

/**
 * Event-Driven Save System with Navigation Blocking + Local Backup
 * 
 * Safety layers:
 * 1. Navigation blocker - prevents switching workflows until save confirmed
 * 2. Local backup recovery - stores workflow state in localStorage as fallback
 * 3. Serialized saves - no race conditions via singleton promise
 * 4. Server-side identity validation - prevents cross-workflow contamination
 */

// ============================================================================
// Global Save State (for UI reactivity)
// ============================================================================

let isSaving = false;

export interface SaveState {
  isSaving: boolean;
}

export function getSaveState(): SaveState {
  return { isSaving };
}

function setSaveState(newState: boolean) {
  isSaving = newState;
  window.dispatchEvent(new CustomEvent('saveStateChanged'));
}

// ============================================================================
// Local Backup System
// ============================================================================

const BACKUP_KEY = 'workflow_backup';

export interface BackupData {
  workflowId: string;
  workflowName: string;
  nodes: any[];
  edges: any[];
  variables: any[];
  settings: any;
  backedUpAt: number;
}

export function backupToLocalStorage(): void {
  const { workflow } = useWorkflowStore.getState();
  
  // Skip temp/new workflows
  if (workflow.id === '1' || workflow.id.startsWith('temp-')) return;
  
  // Only backup if there are unsaved changes
  if (!workflow.unsavedChanges) return;
  
  const backup: BackupData = {
    workflowId: workflow.id,
    workflowName: workflow.name,
    nodes: workflow.nodes,
    edges: workflow.edges,
    variables: workflow.variables,
    settings: workflow.settings,
    backedUpAt: Date.now(),
  };
  
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
    console.log('[SaveOnEvent] Backup saved to localStorage');
  } catch (error) {
    console.warn('[SaveOnEvent] Failed to save backup:', error);
  }
}

export function getBackup(): BackupData | null {
  try {
    const data = localStorage.getItem(BACKUP_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export function clearBackup(): void {
  localStorage.removeItem(BACKUP_KEY);
  console.log('[SaveOnEvent] Backup cleared');
}

// ============================================================================
// Save Result Type
// ============================================================================

export interface SaveResult {
  success: boolean;
  error?: string;
}

// ============================================================================
// Serialized Save with Result
// ============================================================================

// Singleton promise to serialize all saves
let saveInProgress: Promise<SaveResult> | null = null;

/**
 * Save the current workflow to the database.
 * Serialized - waits for any in-flight save to complete before starting.
 * Returns success/failure result for navigation blocking.
 */
export async function saveCurrentWorkflow(): Promise<SaveResult> {
  // Wait for any in-flight save to complete
  if (saveInProgress) {
    await saveInProgress;
  }
  
  const state = useWorkflowStore.getState();
  const { workflow } = state;
  
  // Skip if nothing to save
  if (!workflow.unsavedChanges) {
    return { success: true };
  }
  
  // Skip temp/new workflows
  if (workflow.id === '1' || workflow.id.startsWith('temp-')) {
    return { success: true };
  }
  
  // Set saving state for UI
  setSaveState(true);
  
  // Execute save with retry logic
  saveInProgress = executeSave(workflow);
  
  try {
    const result = await saveInProgress;
    return result;
  } finally {
    saveInProgress = null;
    setSaveState(false);
  }
}

/**
 * Internal save execution with version conflict retry
 */
async function executeSave(
  workflow: ReturnType<typeof useWorkflowStore.getState>['workflow']
): Promise<SaveResult> {
  const identity = workflow._loadedIdentity;
  
  console.log(`[SaveOnEvent] Saving ${workflow.id} v${workflow.version}`);
  
  try {
    const response = await supabase.functions.invoke('save-workflow', {
      body: {
        id: workflow.id,
        name: workflow.name,
        description: null,
        nodes: workflow.nodes,
        edges: workflow.edges,
        variables: workflow.variables,
        settings: workflow.settings,
        expected_version: workflow.version,
        _source: 'event',
        _identity_name: identity?.name,
        _identity_token: identity?.token,
      }
    });

    if (response.error) {
      console.warn('[SaveOnEvent] Save conflict, fetching fresh version...');
      
      // Fetch current version from DB
      const { data: currentWorkflow } = await supabase
        .from('workflows')
        .select('version')
        .eq('id', workflow.id)
        .single();
      
      const freshVersion = currentWorkflow?.version || workflow.version + 1;
      
      // Retry with fresh version (current state, not stale snapshot)
      const currentState = useWorkflowStore.getState().workflow;
      if (currentState.id !== workflow.id) {
        // User navigated away - abort
        console.warn('[SaveOnEvent] User navigated away, aborting retry');
        return { success: false, error: 'Navigation occurred during save' };
      }
      
      const retryResponse = await supabase.functions.invoke('save-workflow', {
        body: {
          id: currentState.id,
          name: currentState.name,
          description: null,
          nodes: currentState.nodes,
          edges: currentState.edges,
          variables: currentState.variables,
          settings: currentState.settings,
          expected_version: freshVersion,
          _source: 'event-retry',
          _identity_name: currentState._loadedIdentity?.name,
          _identity_token: currentState._loadedIdentity?.token,
        }
      });
      
      if (retryResponse.error) {
        console.error('[SaveOnEvent] Retry failed:', retryResponse.error);
        return { success: false, error: retryResponse.error.message || 'Save retry failed' };
      }
      
      // Update local version
      useWorkflowStore.setState((s) => ({
        workflow: {
          ...s.workflow,
          version: retryResponse.data.version,
          unsavedChanges: false,
        }
      }));
      
      console.log(`[SaveOnEvent] Retry succeeded, now at v${retryResponse.data.version}`);
      window.dispatchEvent(new CustomEvent('workflowSaved'));
      return { success: true };
    }

    // Success - update local state
    useWorkflowStore.setState((s) => {
      // Guard: ensure we're still on the same workflow
      if (s.workflow.id !== workflow.id) {
        return s;
      }
      return {
        workflow: {
          ...s.workflow,
          version: response.data.version,
          unsavedChanges: false,
        }
      };
    });
    
    console.log(`[SaveOnEvent] Saved successfully, now at v${response.data.version}`);
    window.dispatchEvent(new CustomEvent('workflowSaved'));
    return { success: true };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown save error';
    console.error('[SaveOnEvent] Save error:', message);
    return { success: false, error: message };
  }
}

/**
 * Synchronous beacon save for page unload ONLY.
 * Last-resort fallback when async saves aren't possible.
 */
export function beaconSave(): void {
  const state = useWorkflowStore.getState().workflow;
  
  if (!state.unsavedChanges) return;
  if (state.id === '1' || state.id.startsWith('temp-')) return;
  
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-workflow`;
  const body = JSON.stringify({
    id: state.id,
    name: state.name,
    description: null,
    nodes: state.nodes,
    edges: state.edges,
    variables: state.variables,
    settings: state.settings,
    expected_version: state.version,
    _source: 'beacon',
    _identity_name: state._loadedIdentity?.name,
    _identity_token: state._loadedIdentity?.token,
  });
  
  navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
  console.log('[SaveOnEvent] Beacon save sent for page unload');
}

/**
 * Hook to set up:
 * 1. Save-on-deselection trigger (with backup before save)
 * 2. Page unload beacon save
 */
export function useSaveOnDeselection() {
  const selectedNodeIds = useWorkflowStore((s) => s.selectedNodeIds);
  const prevSelectedRef = useRef<string[]>([]);
  
  // Trigger save when selection clears (user clicked away from element)
  useEffect(() => {
    if (prevSelectedRef.current.length > 0 && selectedNodeIds.length === 0) {
      // Backup BEFORE save attempt
      backupToLocalStorage();
      
      // Save and clear backup on success
      saveCurrentWorkflow().then((result) => {
        if (result.success) {
          clearBackup();
        }
      });
    }
    prevSelectedRef.current = selectedNodeIds;
  }, [selectedNodeIds]);
  
  // Beacon save on page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const state = useWorkflowStore.getState().workflow;
      if (state.unsavedChanges && 
          state.id !== '1' && 
          !state.id.startsWith('temp-')) {
        // Final backup before potential loss
        backupToLocalStorage();
        beaconSave();
        e.preventDefault();
        e.returnValue = '';
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
}

/**
 * Check for backup on app startup and dispatch recovery event if found
 */
export function checkForBackupRecovery(): void {
  const backup = getBackup();
  
  if (backup) {
    const minutesAgo = (Date.now() - backup.backedUpAt) / 60000;
    
    if (minutesAgo < 60) {
      // Recent backup found - dispatch event for UI to handle
      console.log(`[SaveOnEvent] Found backup from ${Math.round(minutesAgo)} minutes ago`);
      window.dispatchEvent(new CustomEvent('backupRecoveryAvailable', { 
        detail: backup 
      }));
    } else {
      // Too old - discard
      console.log('[SaveOnEvent] Backup too old, discarding');
      clearBackup();
    }
  }
}
