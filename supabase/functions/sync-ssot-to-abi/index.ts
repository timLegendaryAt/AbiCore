import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// Version for deployment verification
const FUNCTION_VERSION = "1.2.0-2025-02-01";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Schema field with nested children support
interface SchemaField {
  field_key: string;
  display_name: string;
  level: string;
  field_type: string;
  is_scored: boolean;
  is_primary_score?: boolean;
  is_primary_description?: boolean;
  children?: SchemaField[];
}

interface DomainSchema {
  domain: string;
  display_name: string;
  field_count: number;
  fields: SchemaField[];
}

// Data field with nested children support
interface DataField {
  field_key: string;
  display_name: string;
  level: string;
  field_type: string;
  is_scored: boolean;
  is_primary_score?: boolean;
  is_primary_description?: boolean;
  value: any;
  score?: number;
  score_reasoning?: string;
  confidence?: number;
  updated_at: string;
  version: number;
  children?: DataField[];
}

interface SSOTSyncPayload {
  action: 'ssot_sync';
  company_uuid: string;
  company_name: string;
  sync_type: 'incremental' | 'full';
  synced_at: string;
  schema: {
    version: string;
    domains: DomainSchema[];
  };
  data: Record<string, {
    domain_score?: number;
    domain_score_description?: string;
    domain_score_reasoning?: string;
    domain_description?: string;
    fields: DataField[];
  }>;
  context_facts: Array<{
    fact_key: string;
    display_name: string;
    value: any;
    category: string;
    domains: string[];
  }>;
  changed_domains?: string[];
  changed_fields?: Array<{
    domain: string;
    field_key: string;
    value: any;
    updated_at: string;
  }>;
}

// Generate SHA-256 hash of content for schema versioning
const hashContent = async (content: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
};

// Generate schema version hash from field definitions
async function generateSchemaVersion(fields: any[]): Promise<string> {
  const schemaString = fields
    .map(f => `${f.domain}:${f.field_key}:${f.level}:${f.field_type}:${f.is_scored}`)
    .sort()
    .join('|');
  return await hashContent(schemaString);
}

// Build structured schema from field definitions with nested L2/L3 hierarchy
function buildSchema(fieldDefs: any[], domainDefs: any[]): DomainSchema[] {
  const domainFieldMap = new Map<string, any[]>();
  
  // Group fields by domain
  for (const field of fieldDefs) {
    const existing = domainFieldMap.get(field.domain) || [];
    existing.push(field);
    domainFieldMap.set(field.domain, existing);
  }
  
  // Build field ID to key lookup for parent resolution
  const fieldIdToKey = new Map<string, string>();
  for (const field of fieldDefs) {
    fieldIdToKey.set(field.id, field.field_key);
  }
  
  return domainDefs.map(domain => {
    const allFields = domainFieldMap.get(domain.domain) || [];
    
    // Separate fields by level
    const l1Fields = allFields.filter(f => f.level === 'L1' || f.level === 'L1C');
    const l2Fields = allFields.filter(f => f.level === 'L2');
    const l3Fields = allFields.filter(f => f.level === 'L3');
    const l4Fields = allFields.filter(f => f.level === 'L4' || !f.level);
    
    // Group L3 fields by their parent L2 field_key
    const l3ByParent = new Map<string, any[]>();
    for (const l3 of l3Fields) {
      const parentKey = l3.parent_field_id ? fieldIdToKey.get(l3.parent_field_id) : null;
      if (parentKey) {
        const existing = l3ByParent.get(parentKey) || [];
        existing.push(l3);
        l3ByParent.set(parentKey, existing);
      }
    }
    
    // Group L4 fields by their parent L3 field_key
    const l4ByParent = new Map<string, any[]>();
    for (const l4 of l4Fields) {
      const parentKey = l4.parent_field_id ? fieldIdToKey.get(l4.parent_field_id) : null;
      if (parentKey) {
        const existing = l4ByParent.get(parentKey) || [];
        existing.push(l4);
        l4ByParent.set(parentKey, existing);
      }
    }
    
    // Helper to build schema field
    const buildSchemaField = (f: any): SchemaField => ({
      field_key: f.field_key,
      display_name: f.display_name,
      level: f.level || 'L4',
      field_type: f.field_type,
      is_scored: f.is_scored || false,
      is_primary_score: f.is_primary_score || false,
      is_primary_description: f.is_primary_description || false,
    });
    
    // Build L3 with nested L4 children
    const buildL3WithChildren = (l3: any): SchemaField => {
      const l4Children = (l4ByParent.get(l3.field_key) || []).map(buildSchemaField);
      return {
        ...buildSchemaField(l3),
        children: l4Children.length > 0 ? l4Children : undefined,
      };
    };
    
    // Build hierarchical L2 fields with nested L3 children (which may have L4 children)
    const hierarchicalL2: SchemaField[] = l2Fields.map(l2 => ({
      ...buildSchemaField(l2),
      children: (l3ByParent.get(l2.field_key) || []).map(buildL3WithChildren),
    }));
    
    // L1 fields remain flat
    const flatL1: SchemaField[] = l1Fields.map(buildSchemaField);
    
    // Only include L4 fields that have NO parent (orphans)
    const orphanL4: SchemaField[] = l4Fields
      .filter(f => !f.parent_field_id)
      .map(buildSchemaField);
    
    return {
      domain: domain.domain,
      display_name: domain.display_name,
      field_count: allFields.length,
      fields: [...flatL1, ...hierarchicalL2, ...orphanL4],
    };
  });
}

// Build data payload from master data with nested L2/L3 hierarchy
function buildDataPayload(
  masterData: any[],
  domainScores: any[],
  fieldDefs: any[],
  domainDefs: any[]
): SSOTSyncPayload['data'] {
  const data: SSOTSyncPayload['data'] = {};
  
  // Create field lookup for display names and metadata
  const fieldLookup = new Map<string, any>();
  const fieldIdToKey = new Map<string, string>();
  for (const field of fieldDefs) {
    fieldLookup.set(`${field.domain}:${field.field_key}`, field);
    fieldIdToKey.set(field.id, field.field_key);
  }
  
  // Create domain score lookup
  const scoreMap = new Map<string, any>();
  for (const score of domainScores) {
    scoreMap.set(score.domain, score);
  }
  
  // Group master data by domain
  const domainDataMap = new Map<string, any[]>();
  for (const record of masterData) {
    const existing = domainDataMap.get(record.domain) || [];
    existing.push(record);
    domainDataMap.set(record.domain, existing);
  }
  
  // Helper to build a data field object
  const buildField = (record: any): DataField => {
    const fieldDef = fieldLookup.get(`${record.domain}:${record.field_key}`);
    return {
      field_key: record.field_key,
      display_name: fieldDef?.display_name || record.field_key,
      level: fieldDef?.level || 'L4',
      field_type: record.field_type || fieldDef?.field_type || 'text',
      is_scored: fieldDef?.is_scored || false,
      is_primary_score: fieldDef?.is_primary_score || false,
      is_primary_description: fieldDef?.is_primary_description || false,
      value: record.field_value,
      score: record.score,
      score_reasoning: record.score_reasoning,
      confidence: record.confidence_score,
      updated_at: record.updated_at,
      version: record.version,
    };
  };
  
  // Build data structure for each domain
  for (const domain of domainDefs) {
    const domainName = domain.domain;
    const records = domainDataMap.get(domainName) || [];
    const score = scoreMap.get(domainName);
    
    // Extract L1 summary fields from master data
    const domainScoreRecord = records.find(r => r.field_key === 'domain_score');
    const domainDescRecord = records.find(r => r.field_key === 'domain_description');
    const domainScoreDescRecord = records.find(r => r.field_key === 'domain_score_description');
    const domainScoreReasonRecord = records.find(r => r.field_key === 'domain_score_reasoning');
    
    // Separate records by level
    const l1Records = records.filter(r => {
      const def = fieldLookup.get(`${r.domain}:${r.field_key}`);
      return def?.level === 'L1' || def?.level === 'L1C';
    });
    const l2Records = records.filter(r => {
      const def = fieldLookup.get(`${r.domain}:${r.field_key}`);
      return def?.level === 'L2';
    });
    const l3Records = records.filter(r => {
      const def = fieldLookup.get(`${r.domain}:${r.field_key}`);
      return def?.level === 'L3';
    });
    const l4Records = records.filter(r => {
      const def = fieldLookup.get(`${r.domain}:${r.field_key}`);
      return !def?.level || def?.level === 'L4';
    });
    
    // Group L3 by parent field key
    const l3ByParent = new Map<string, any[]>();
    for (const l3Record of l3Records) {
      const def = fieldLookup.get(`${l3Record.domain}:${l3Record.field_key}`);
      const parentKey = def?.parent_field_id ? fieldIdToKey.get(def.parent_field_id) : null;
      if (parentKey) {
        const existing = l3ByParent.get(parentKey) || [];
        existing.push(l3Record);
        l3ByParent.set(parentKey, existing);
      }
    }
    
    // Group L4 by parent L3 field key
    const l4ByParent = new Map<string, any[]>();
    for (const l4Record of l4Records) {
      const def = fieldLookup.get(`${l4Record.domain}:${l4Record.field_key}`);
      const parentKey = def?.parent_field_id ? fieldIdToKey.get(def.parent_field_id) : null;
      if (parentKey) {
        const existing = l4ByParent.get(parentKey) || [];
        existing.push(l4Record);
        l4ByParent.set(parentKey, existing);
      }
    }
    
    // Build L3 with nested L4 children
    const buildL3WithChildren = (l3Record: any): DataField => {
      const l3Def = fieldLookup.get(`${l3Record.domain}:${l3Record.field_key}`);
      const l4Children = (l4ByParent.get(l3Record.field_key) || []).map(buildField);
      return {
        ...buildField(l3Record),
        children: l4Children.length > 0 ? l4Children : undefined,
      };
    };
    
    // Get L2 field definitions for this domain (not just records)
    const l2FieldDefs = (fieldDefs || []).filter(
      f => f.domain === domainName && f.level === 'L2'
    );
    
    // Build hierarchical L2 fields - include all L2s with children OR data
    const hierarchicalL2: DataField[] = l2FieldDefs
      .map(l2Def => {
        // Check if we have actual data for this L2
        const l2Record = l2Records.find(r => r.field_key === l2Def.field_key);
        const childRecords = l3ByParent.get(l2Def.field_key) || [];
        
        // Skip if no data AND no children (nothing to sync)
        if (!l2Record && childRecords.length === 0) {
          return null;
        }
        
        // Build L2 field from data if exists, otherwise create stub from definition
        const l2Field: DataField = l2Record 
          ? buildField(l2Record)
          : {
              field_key: l2Def.field_key,
              display_name: l2Def.display_name,
              level: 'L2',
              field_type: l2Def.field_type,
              is_scored: l2Def.is_scored || false,
              is_primary_score: l2Def.is_primary_score || false,
              is_primary_description: l2Def.is_primary_description || false,
              value: null,
              updated_at: new Date().toISOString(),
              version: 1,
            };
        
        return {
          ...l2Field,
          children: childRecords.map(buildL3WithChildren),
        };
      })
      .filter((f): f is DataField & { children: DataField[] } => f !== null);
    
    // L1 fields remain flat
    const flatL1 = l1Records.map(buildField);
    
    // Only include L4 fields that have NO parent (orphans)
    const orphanL4 = l4Records.filter(r => {
      const def = fieldLookup.get(`${r.domain}:${r.field_key}`);
      return !def?.parent_field_id;
    }).map(buildField);
    
    // Round domain scores to integers for Abi compatibility
    const rawDomainScore = score?.score ?? domainScoreRecord?.field_value;
    const domainScore = typeof rawDomainScore === 'number' 
      ? Math.round(rawDomainScore) 
      : rawDomainScore;
    
    data[domainName] = {
      domain_score: domainScore,
      domain_score_description: domainScoreDescRecord?.field_value as string,
      domain_score_reasoning: score?.reasoning ?? domainScoreReasonRecord?.field_value,
      domain_description: domainDescRecord?.field_value as string,
      fields: [...flatL1, ...hierarchicalL2, ...orphanL4],
    };
  }
  
  return data;
}

// Build context facts payload - always include 'overview' for roll-up
function buildContextFacts(contextFacts: any[]): SSOTSyncPayload['context_facts'] {
  return contextFacts.map(fact => {
    const assignedDomains = fact.domain_context_references?.map((ref: any) => ref.domain) || [];
    
    // Always include 'overview' for all facts (roll-up view)
    const domainsWithOverview = assignedDomains.includes('overview') 
      ? assignedDomains 
      : ['overview', ...assignedDomains];
    
    return {
      fact_key: fact.fact_key,
      display_name: fact.display_name,
      value: fact.fact_value,
      category: fact.category,
      domains: domainsWithOverview,
    };
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint
  const url = new URL(req.url);
  if (url.searchParams.get('health') === 'true') {
    return new Response(JSON.stringify({
      status: 'healthy',
      version: FUNCTION_VERSION,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const startTime = Date.now();

  try {
    const { 
      company_id, 
      sync_type = 'full',
      enforce_schema = false,
      changed_domains,
      changed_fields,
      triggered_by = 'manual'
    } = await req.json();

    if (!company_id) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required field: company_id'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const abiWebhookUrl = Deno.env.get('ABI_WEBHOOK_URL');
    const abiPlatformSecret = Deno.env.get('ABI_PLATFORM_SECRET');
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[sync-ssot-to-abi] v${FUNCTION_VERSION} - Starting ${sync_type} sync for company ${company_id} (enforce_schema: ${enforce_schema}, triggered_by: ${triggered_by})`);

    // Check if Abi webhook is configured
    if (!abiWebhookUrl) {
      console.log('[sync-ssot-to-abi] ABI_WEBHOOK_URL not configured, skipping sync');
      return new Response(JSON.stringify({
        success: false,
        skipped: true,
        reason: 'ABI_WEBHOOK_URL not configured'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 1. Fetch company info
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, slug')
      .eq('id', company_id)
      .single();

    if (companyError || !company) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Company not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 2. Fetch all required data in parallel
    const [
      { data: fieldDefs },
      { data: domainDefs },
      { data: masterData },
      { data: contextFacts },
      { data: domainScores }
    ] = await Promise.all([
      supabase
        .from('company_field_definitions')
        .select('*')
        .order('domain')
        .order('level')
        .order('sort_order'),
      supabase
        .from('company_domain_definitions')
        .select('*')
        .order('sort_order'),
      supabase
        .from('company_master_data')
        .select('*')
        .eq('company_id', company_id),
      supabase
        .from('company_context_facts')
        .select('*, domain_context_references(domain)')
        .eq('company_id', company_id),
      supabase
        .from('company_domain_scores')
        .select('*')
        .eq('company_id', company_id)
    ]);

    console.log(`[sync-ssot-to-abi] Fetched: ${fieldDefs?.length || 0} field defs, ${masterData?.length || 0} master data, ${contextFacts?.length || 0} context facts`);

    // 3. Apply schema enforcement filter if enabled
    let filteredMasterData = masterData || [];
    let filteredCount = 0;
    
    if (enforce_schema) {
      const validFieldKeys = new Set(
        (fieldDefs || []).map(f => `${f.domain}:${f.field_key}`)
      );
      const originalCount = filteredMasterData.length;
      filteredMasterData = filteredMasterData.filter(
        record => validFieldKeys.has(`${record.domain}:${record.field_key}`)
      );
      filteredCount = originalCount - filteredMasterData.length;
      console.log(`[sync-ssot-to-abi] Schema enforcement: ${originalCount} → ${filteredMasterData.length} fields (${filteredCount} filtered)`);
    }

    // 4. Build schema with nested L2/L3 hierarchy
    const schema = buildSchema(fieldDefs || [], domainDefs || []);
    const schemaVersion = await generateSchemaVersion(fieldDefs || []);

    // 5. Build data payload with nested L2/L3 hierarchy
    const data = buildDataPayload(filteredMasterData, domainScores || [], fieldDefs || [], domainDefs || []);

    // 6. Build context facts
    const contextFactsPayload = buildContextFacts(contextFacts || []);

    // 7. Build final payload
    const payload: SSOTSyncPayload = {
      action: 'ssot_sync',
      company_uuid: company.id,
      company_name: company.name,
      sync_type: sync_type as 'incremental' | 'full',
      synced_at: new Date().toISOString(),
      schema: {
        version: schemaVersion,
        domains: schema,
      },
      data,
      context_facts: contextFactsPayload,
    };

    // Add incremental data if provided
    if (sync_type === 'incremental') {
      if (changed_domains) {
        payload.changed_domains = changed_domains;
      }
      if (changed_fields) {
        payload.changed_fields = changed_fields;
      }
    }

    // 8. Create pending log entry
    const { data: logEntry, error: logError } = await supabase
      .from('abi_sync_history')
      .insert({
        company_id: company.id,
        sync_type,
        status: 'pending',
        fields_synced: filteredMasterData.length,
        context_facts_synced: contextFactsPayload.length,
        filtered_count: filteredCount,
        schema_version: schemaVersion,
        triggered_by
      })
      .select()
      .single();

    if (logError) {
      console.warn('[sync-ssot-to-abi] Failed to create log entry:', logError);
    }

    // 9. Send to Abi webhook
    console.log(`[sync-ssot-to-abi] Sending payload to Abi: ${Object.keys(data).length} domains, ${contextFactsPayload.length} context facts (hierarchical L2/L3 format)`);

    const webhookResponse = await fetch(abiWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(abiPlatformSecret ? { 'X-Platform-Secret': abiPlatformSecret } : {}),
      },
      body: JSON.stringify(payload),
    });

    const webhookStatus = webhookResponse.status;
    let webhookResult: any = null;

    try {
      webhookResult = await webhookResponse.json();
    } catch {
      webhookResult = { raw: await webhookResponse.text() };
    }

    const executionTime = Date.now() - startTime;

    // 10. Update log entry with result
    if (logEntry?.id) {
      await supabase
        .from('abi_sync_history')
        .update({
          status: webhookResponse.ok ? 'success' : 'failed',
          webhook_status: webhookStatus,
          webhook_response: webhookResult,
          error_message: webhookResponse.ok ? null : `Webhook returned ${webhookStatus}`,
          execution_time_ms: executionTime
        })
        .eq('id', logEntry.id);
    }

    if (!webhookResponse.ok) {
      console.error(`[sync-ssot-to-abi] Webhook failed: ${webhookStatus}`, webhookResult);
      return new Response(JSON.stringify({
        success: false,
        error: `Webhook returned ${webhookStatus}`,
        webhook_response: webhookResult,
        execution_time_ms: executionTime
      }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[sync-ssot-to-abi] Completed in ${executionTime}ms, webhook responded: ${webhookStatus}`);

    return new Response(JSON.stringify({
      success: true,
      company_id: company.id,
      company_name: company.name,
      sync_type,
      enforce_schema,
      fields_synced: filteredMasterData.length,
      filtered_count: filteredCount,
      context_facts_synced: contextFactsPayload.length,
      schema_version: schemaVersion,
      webhook_status: webhookStatus,
      webhook_response: webhookResult,
      execution_time_ms: executionTime
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[sync-ssot-to-abi] Unexpected error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unexpected error',
      execution_time_ms: Date.now() - startTime
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
