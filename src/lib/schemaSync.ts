import { supabase } from '@/integrations/supabase/client';

export type SchemaSyncTrigger =
  | 'field_created'
  | 'field_updated'
  | 'field_deleted'
  | 'domain_updated'
  | 'context_fact_def_created'
  | 'context_fact_def_updated'
  | 'context_fact_def_deleted'
  | 'manual';

export interface ChangedEntity {
  type: 'field' | 'domain' | 'context_fact_def';
  operation: 'create' | 'update' | 'delete';
  key: string;
  domain?: string;
}

/**
 * Triggers a schema sync to the Abi platform.
 * This broadcasts the current SSOT structure (fields, domains, context facts)
 * without any company-specific data.
 * 
 * Non-blocking - errors are logged but don't interrupt user flow.
 */
export async function triggerSchemaSync(
  trigger: SchemaSyncTrigger,
  changedEntity?: ChangedEntity
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Triggering schema sync: ${trigger}`, changedEntity);
    
    const { data, error } = await supabase.functions.invoke('sync-schema-to-abi', {
      body: { 
        trigger, 
        changed_entity: changedEntity 
      }
    });

    if (error) {
      console.error('Schema sync failed:', error);
      return { success: false, error: error.message };
    }

    console.log('Schema sync result:', data);
    return { success: true };
  } catch (error) {
    console.error('Schema sync error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}
