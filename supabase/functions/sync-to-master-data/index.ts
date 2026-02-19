import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MasterDataOutput {
  node_id: string;
  node_label: string;
  workflow_id: string;
  domain: string;
  field_key: string;
  value: any;
}

interface SyncRequest {
  company_id: string;
  outputs: MasterDataOutput[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: SyncRequest = await req.json();
    const { company_id, outputs } = body;

    if (!company_id || !outputs || !Array.isArray(outputs)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: company_id and outputs array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-to-master-data] Processing ${outputs.length} outputs for company ${company_id}`);

    const results: Array<{ field_key: string; status: 'created' | 'updated' | 'error'; error?: string }> = [];

    for (const output of outputs) {
      const { node_id, node_label, workflow_id, domain, field_key, value } = output;

      try {
        // Look up field type from definitions
        const { data: fieldDef } = await supabase
          .from('company_field_definitions')
          .select('field_type')
          .eq('domain', domain)
          .eq('field_key', field_key)
          .single();

        const fieldType = fieldDef?.field_type || 'text';

        // Check if record exists
        const { data: existing } = await supabase
          .from('company_master_data')
          .select('id, version')
          .eq('company_id', company_id)
          .eq('domain', domain)
          .eq('field_key', field_key)
          .single();

        // Prepare field_value as JSONB - wrap in object for consistent storage
        const fieldValue = typeof value === 'object' ? value : { value };

        const sourceReference = {
          workflow_id,
          node_id,
          node_label,
          synced_at: new Date().toISOString(),
        };

        if (existing) {
          // Update existing record
          const { error: updateError } = await supabase
            .from('company_master_data')
            .update({
              field_value: fieldValue,
              field_type: fieldType,
              source_type: 'generated',
              source_reference: sourceReference,
              // version and updated_at are handled by the trigger
            })
            .eq('id', existing.id);

          if (updateError) {
            console.error(`[sync-to-master-data] Update error for ${field_key}:`, updateError);
            results.push({ field_key, status: 'error', error: updateError.message });
          } else {
            console.log(`[sync-to-master-data] Updated ${domain}.${field_key} for company ${company_id}`);
            results.push({ field_key, status: 'updated' });
          }
        } else {
          // Insert new record
          const { error: insertError } = await supabase
            .from('company_master_data')
            .insert({
              company_id,
              domain,
              field_key,
              field_value: fieldValue,
              field_type: fieldType,
              source_type: 'generated',
              source_reference: sourceReference,
              version: 1,
            });

          if (insertError) {
            console.error(`[sync-to-master-data] Insert error for ${field_key}:`, insertError);
            results.push({ field_key, status: 'error', error: insertError.message });
          } else {
            console.log(`[sync-to-master-data] Created ${domain}.${field_key} for company ${company_id}`);
            results.push({ field_key, status: 'created' });
          }
        }
      } catch (err: any) {
        console.error(`[sync-to-master-data] Error processing ${field_key}:`, err);
        results.push({ field_key, status: 'error', error: err.message });
      }
    }

    const successCount = results.filter(r => r.status !== 'error').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`[sync-to-master-data] Completed: ${successCount} success, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: errorCount === 0,
        company_id,
        processed: outputs.length,
        results,
        summary: {
          created: results.filter(r => r.status === 'created').length,
          updated: results.filter(r => r.status === 'updated').length,
          errors: errorCount,
        },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[sync-to-master-data] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
