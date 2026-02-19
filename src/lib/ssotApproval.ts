import { supabase } from '@/integrations/supabase/client';
import { SSOTPendingChange } from '@/types/ssot-changes';
import { toast } from 'sonner';

/**
 * Approve an SSOT pending change and apply it to the appropriate table
 * @returns true if successful, false otherwise
 */
export async function approveSSOTChange(change: SSOTPendingChange): Promise<boolean> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    // Update the pending change status FIRST
    const { error: updateError } = await supabase
      .from('ssot_pending_changes')
      .update({
        status: 'approved',
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', change.id);

    if (updateError) throw updateError;

    // Check for create_field FIRST (regardless of level)
    if (change.action === 'create_field') {
      const fieldData = change.proposed_value as {
        field_key: string;
        display_name: string;
        field_type: string;
        score_weight?: number;
      };

      const { error: createError } = await supabase
        .from('company_field_definitions')
        .upsert({
          domain: change.target_domain as any,
          field_key: fieldData.field_key,
          display_name: fieldData.display_name,
          field_type: fieldData.field_type,
          level: change.target_level as any,
          is_scored: change.is_scored,
          evaluation_method: change.evaluation_method,
          score_weight: fieldData.score_weight || 1.0,
          parent_field_id: null,
        }, {
          onConflict: 'domain,field_key',
        });

      if (createError) {
        console.error('Error creating field definition:', createError);
        throw createError;
      }
    } 
    // L1C (Context Facts) - never scored
    else if (change.target_level === 'L1C') {
      const factKey = change.target_path.l4 || change.target_path.l3 || change.target_path.l2 || change.change_id;
      
      const { error: upsertError } = await supabase
        .from('company_context_facts')
        .upsert({
          company_id: change.company_id,
          fact_key: factKey,
          fact_value: change.proposed_value,
          fact_type: change.data_type,
          category: 'attribute',
          display_name: factKey?.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) || '',
          source_type: 'generated',
          source_reference: {
            pending_change_id: change.id,
            ...change.provenance,
          },
        }, {
          onConflict: 'company_id,fact_key',
        });

      if (upsertError) {
        console.error('Error upserting context fact:', upsertError);
        throw upsertError;
      }
    } 
    // L2, L3, L4 all go to company_master_data
    else if (['L2', 'L3', 'L4'].includes(change.target_level)) {
      // Extract field key with fallback
      const fieldKey = change.target_path.l4 
        || change.target_path.l3 
        || change.target_path.l2 
        || change.change_id.replace('CHG-', 'field_');
      
      if (!fieldKey) {
        console.error('No valid field key for change:', change.id, change.target_path);
        throw new Error('Unable to determine field key for SSOT update');
      }

      const { error: upsertError } = await supabase
        .from('company_master_data')
        .upsert({
          company_id: change.company_id,
          domain: change.target_domain as any,
          field_key: fieldKey,
          field_value: change.proposed_value,
          field_type: change.data_type === 'measurement' ? 'number' : 'text',
          source_type: 'generated',
          source_reference: {
            pending_change_id: change.id,
            ...change.provenance,
          },
        }, {
          onConflict: 'company_id,domain,field_key',
        });

      if (upsertError) {
        console.error('Error upserting master data:', upsertError);
        throw upsertError;
      }
    }

    // Resolve the linked alert
    if (change.alert_id) {
      await supabase
        .from('system_alerts')
        .update({ 
          is_resolved: true, 
          resolved_by: userId,
        })
        .eq('id', change.alert_id);
    }

    toast.success('Change approved and applied to SSOT');
    return true;
  } catch (error) {
    console.error('Error approving change:', error);
    toast.error('Failed to approve change');
    return false;
  }
}

/**
 * Reject an SSOT pending change
 * @returns true if successful, false otherwise
 */
export async function rejectSSOTChange(
  change: SSOTPendingChange, 
  rejectionReason?: string
): Promise<boolean> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    const { error: updateError } = await supabase
      .from('ssot_pending_changes')
      .update({
        status: 'rejected',
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejectionReason,
      })
      .eq('id', change.id);

    if (updateError) throw updateError;

    // Resolve the linked alert with rejection note
    if (change.alert_id) {
      await supabase
        .from('system_alerts')
        .update({ 
          is_resolved: true, 
          resolved_by: userId,
          description: `Rejected: ${rejectionReason}`,
        })
        .eq('id', change.alert_id);
    }

    toast.success('Change rejected');
    return true;
  } catch (error) {
    console.error('Error rejecting change:', error);
    toast.error('Failed to reject change');
    return false;
  }
}

/**
 * Fetch a pending change by ID
 */
export async function fetchPendingChange(changeId: string): Promise<SSOTPendingChange | null> {
  const { data, error } = await supabase
    .from('ssot_pending_changes')
    .select('*')
    .eq('id', changeId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching pending change:', error);
    return null;
  }

  return data as SSOTPendingChange | null;
}

/**
 * Extract pending change ID from action URL
 */
export function extractPendingChangeId(actionUrl: string | null): string | null {
  if (!actionUrl) return null;
  const match = actionUrl.match(/pending_change=([a-f0-9-]+)/i);
  return match ? match[1] : null;
}
