import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FieldDefinition {
  id: string;
  field_key: string;
  display_name: string;
  description: string | null;
  field_type: string;
  domain: string;
  level: string | null;
  parent_field_id: string | null;
  is_scored: boolean | null;
  evaluation_method: string | null;
  sort_order: number | null;
  is_primary_score: boolean | null;
  is_primary_description: boolean | null;
}

interface DomainDefinition {
  domain: string;
  display_name: string;
  description: string | null;
  icon_name: string | null;
  color: string | null;
  sort_order: number | null;
}

interface ContextFactDefinition {
  id: string;
  fact_key: string;
  display_name: string;
  description: string | null;
  fact_type: string;
  category: string;
  default_domains: string[] | null;
  allowed_values: any;
}

interface SchemaField {
  field_key: string;
  display_name: string;
  level: string;
  field_type: string;
  is_scored: boolean;
  is_primary_score?: boolean;
  is_primary_description?: boolean;
  parent_field_key?: string | null;
  evaluation_method: string | null;
  description: string | null;
  children?: SchemaField[];
}

interface SchemaDomain {
  domain: string;
  display_name: string;
  description: string | null;
  color: string | null;
  icon_name: string | null;
  field_count: number;
  fields: SchemaField[];
}

interface SchemaSyncPayload {
  action: 'schema_sync';
  synced_at: string;
  trigger: string;
  schema: {
    version: string;
    domains: SchemaDomain[];
  };
  context_fact_definitions: Array<{
    fact_key: string;
    display_name: string;
    fact_type: string;
    category: string;
    default_domains: string[];
    allowed_values: any;
  }>;
  changed_entity?: {
    type: 'field' | 'domain' | 'context_fact_def';
    operation: 'create' | 'update' | 'delete';
    key: string;
    domain?: string;
  };
}

async function generateSchemaVersion(
  fields: FieldDefinition[],
  domains: DomainDefinition[],
  contextFacts: ContextFactDefinition[]
): Promise<string> {
  const schemaString = JSON.stringify({
    fields: fields.map(f => ({
      key: f.field_key,
      domain: f.domain,
      level: f.level,
      type: f.field_type,
      scored: f.is_scored,
    })),
    domains: domains.map(d => d.domain),
    contextFacts: contextFacts.map(cf => cf.fact_key),
  });
  
  const encoder = new TextEncoder();
  const data = encoder.encode(schemaString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 16);
}

async function buildSchemaPayload(
  fields: FieldDefinition[],
  domains: DomainDefinition[],
  contextFacts: ContextFactDefinition[]
): Promise<SchemaSyncPayload['schema']> {
  // Create lookup maps
  const fieldIdToKey = new Map(fields.map(f => [f.id, f.field_key]));
  
  const schemaDomains: SchemaDomain[] = domains.map(domain => {
    const domainFields = fields.filter(f => f.domain === domain.domain);
    
    // Separate fields by level
    const l1Fields = domainFields.filter(f => f.level === 'L1');
    const l1cFields = domainFields.filter(f => f.level === 'L1C');
    const l2Fields = domainFields.filter(f => f.level === 'L2');
    const l3Fields = domainFields.filter(f => f.level === 'L3');
    const l4Fields = domainFields.filter(f => !f.level || f.level === 'L4');
    
    // Group L3 fields by their L2 parent
    const l3ByParent = new Map<string, FieldDefinition[]>();
    for (const l3 of l3Fields) {
      const parentKey = l3.parent_field_id 
        ? fieldIdToKey.get(l3.parent_field_id) 
        : null;
      if (parentKey) {
        const existing = l3ByParent.get(parentKey) || [];
        existing.push(l3);
        l3ByParent.set(parentKey, existing);
      }
    }
    
    // Group L4 fields by their L3 parent
    const l4ByParent = new Map<string, FieldDefinition[]>();
    for (const l4 of l4Fields) {
      const parentKey = l4.parent_field_id 
        ? fieldIdToKey.get(l4.parent_field_id) 
        : null;
      if (parentKey) {
        const existing = l4ByParent.get(parentKey) || [];
        existing.push(l4);
        l4ByParent.set(parentKey, existing);
      }
    }
    
    // Helper to build a schema field object
    const buildField = (f: FieldDefinition): SchemaField => ({
      field_key: f.field_key,
      display_name: f.display_name,
      level: f.level || 'L4',
      field_type: f.field_type,
      is_scored: f.is_scored || false,
      is_primary_score: f.is_primary_score || false,
      is_primary_description: f.is_primary_description || false,
      evaluation_method: f.evaluation_method,
      description: f.description,
    });
    
    // Build L3 fields with nested L4 children
    const buildL3WithChildren = (l3: FieldDefinition): SchemaField => {
      const l4Children = (l4ByParent.get(l3.field_key) || []).map(buildField);
      return {
        ...buildField(l3),
        children: l4Children.length > 0 ? l4Children : undefined,
      };
    };
    
    // Build L2 fields with nested L3 children (which may have L4 children)
    const hierarchicalL2 = l2Fields.map(l2 => {
      const l3Children = (l3ByParent.get(l2.field_key) || []).map(buildL3WithChildren);
      return {
        ...buildField(l2),
        children: l3Children,
      };
    });
    
    // L1, L1C fields remain flat
    const flatL1 = l1Fields.map(buildField);
    const flatL1C = l1cFields.map(buildField);
    
    // Only include L4 fields that have NO parent (orphans)
    const orphanL4 = l4Fields.filter(f => !f.parent_field_id).map(buildField);
    
    return {
      domain: domain.domain,
      display_name: domain.display_name,
      description: domain.description,
      color: domain.color,
      icon_name: domain.icon_name,
      field_count: domainFields.length,
      fields: [...flatL1, ...flatL1C, ...hierarchicalL2, ...orphanL4],
    };
  });

  return {
    version: await generateSchemaVersion(fields, domains, contextFacts),
    domains: schemaDomains,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const abiWebhookUrl = Deno.env.get('ABI_WEBHOOK_URL');
    const abiPlatformSecret = Deno.env.get('ABI_PLATFORM_SECRET');

    if (!abiWebhookUrl || !abiPlatformSecret) {
      console.log('Abi integration not configured, skipping schema sync');
      return new Response(
        JSON.stringify({ 
          success: true, 
          skipped: true,
          reason: 'Abi integration not configured' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body for trigger info
    let trigger = 'manual';
    let changedEntity: SchemaSyncPayload['changed_entity'] | undefined;
    
    try {
      const body = await req.json();
      trigger = body.trigger || 'manual';
      changedEntity = body.changed_entity;
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log(`Schema sync triggered: ${trigger}`);

    // Fetch all schema data in parallel
    const [fieldsRes, domainsRes, contextFactsRes] = await Promise.all([
      supabase
        .from('company_field_definitions')
        .select('*')
        .order('sort_order'),
      supabase
        .from('company_domain_definitions')
        .select('*')
        .order('sort_order'),
      supabase
        .from('context_fact_definitions')
        .select('*')
        .order('sort_order'),
    ]);

    if (fieldsRes.error) throw fieldsRes.error;
    if (domainsRes.error) throw domainsRes.error;
    if (contextFactsRes.error) throw contextFactsRes.error;

    const fields = fieldsRes.data || [];
    const domains = domainsRes.data || [];
    const contextFacts = contextFactsRes.data || [];

    // Build the schema sync payload
    const schema = await buildSchemaPayload(fields, domains, contextFacts);
    const payload: SchemaSyncPayload = {
      action: 'schema_sync',
      synced_at: new Date().toISOString(),
      trigger,
      schema,
      context_fact_definitions: contextFacts.map(cf => ({
        fact_key: cf.fact_key,
        display_name: cf.display_name,
        fact_type: cf.fact_type,
        category: cf.category,
        default_domains: cf.default_domains || [],
        allowed_values: cf.allowed_values,
      })),
    };

    if (changedEntity) {
      payload.changed_entity = changedEntity;
    }

    console.log(`Syncing schema version ${payload.schema.version} to Abi`);
    console.log(`Domains: ${payload.schema.domains.length}, Total fields: ${fields.length}, Context facts: ${contextFacts.length}`);
    
    // Debug: Check secret value (first 4 chars only for security)
    const secretPreview = abiPlatformSecret ? `${abiPlatformSecret.substring(0, 4)}...` : 'EMPTY';
    console.log(`Secret preview: ${secretPreview}, URL: ${abiWebhookUrl}`);

    // Send to Abi platform
    const abiResponse = await fetch(abiWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${abiPlatformSecret}`,
        'X-Platform-Secret': abiPlatformSecret,
      },
      body: JSON.stringify(payload),
    });

    if (!abiResponse.ok) {
      const errorText = await abiResponse.text();
      console.error(`Abi sync failed: ${abiResponse.status} - ${errorText}`);
      throw new Error(`Abi responded with ${abiResponse.status}: ${errorText}`);
    }

    let abiResult;
    try {
      abiResult = await abiResponse.json();
    } catch {
      abiResult = { received: true };
    }

    console.log('Schema sync successful:', abiResult);

    return new Response(
      JSON.stringify({
        success: true,
        schema_version: payload.schema.version,
        domains_count: payload.schema.domains.length,
        fields_count: fields.length,
        context_facts_count: contextFacts.length,
        trigger,
        abi_response: abiResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Schema sync error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
