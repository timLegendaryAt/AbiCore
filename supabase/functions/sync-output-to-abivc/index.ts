import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OutputNode {
  node_id: string;
  node_label: string;
  node_type: string;
  workflow_id: string;
  workflow_name: string;
  data: any;
  version: number;
  updated_at: string;
}

interface SyncRequest {
  company_id: string;
  outputs: OutputNode[];
}

// Convert label to field_name (e.g., "Executive Summary" -> "executive_summary")
function toFieldName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');
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

    console.log('[sync-output-to-abivc] Request received:', { 
      company_id, 
      output_count: outputs?.length || 0 
    });

    if (!company_id || !outputs || outputs.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing company_id or outputs' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch company to verify and get name
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, metadata')
      .eq('id', company_id)
      .single();

    if (companyError || !company) {
      console.error('[sync-output-to-abivc] Company not found:', company_id);
      return new Response(
        JSON.stringify({ success: false, error: 'Company not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log the company origin for debugging
    const metadata = company.metadata as { synced_from?: string } | null;
    console.log('[sync-output-to-abivc] Company origin:', {
      company_id,
      synced_from: metadata?.synced_from || 'unknown'
    });

    // Get the AbiVC webhook URL from secrets
    const abivcWebhookUrl = Deno.env.get('ABIVC_WEBHOOK_URL');
    const abivcSecret = Deno.env.get('ABIVC_PLATFORM_SECRET');

    if (!abivcWebhookUrl) {
      console.warn('[sync-output-to-abivc] ABIVC_WEBHOOK_URL not configured, logging output only');
      
      // Log what would be sent for debugging
      const payload = {
        action: 'receive_output',
        company_uuid: company_id,
        company_name: company.name,
        outputs: outputs.map(o => ({
          ...o,
          field_name: toFieldName(o.node_label),
        })),
        synced_at: new Date().toISOString(),
      };
      console.log('[sync-output-to-abivc] Would send to AbiVC:', JSON.stringify(payload, null, 2));
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'ABIVC_WEBHOOK_URL not configured, sync skipped',
          synced: false,
          would_send: payload
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Prepare the payload for AbiVC
    const payload = {
      action: 'receive_output',
      company_uuid: company_id,
      company_name: company.name,
      outputs: outputs.map(o => ({
        node_id: o.node_id,
        node_label: o.node_label,
        node_type: o.node_type,
        workflow_id: o.workflow_id,
        workflow_name: o.workflow_name,
        field_name: toFieldName(o.node_label),
        data: o.data,
        version: o.version,
        updated_at: o.updated_at,
      })),
      synced_at: new Date().toISOString(),
    };

    console.log('[sync-output-to-abivc] Sending to AbiVC:', {
      url: abivcWebhookUrl,
      company_uuid: company_id,
      output_count: outputs.length,
    });

    // Send to AbiVC
    const response = await fetch(abivcWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-platform-secret': abivcSecret || '',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    console.log('[sync-output-to-abivc] AbiVC response:', {
      status: response.status,
      data: responseData,
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `AbiVC returned status ${response.status}`,
          abivc_response: responseData
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Outputs synced to AbiVC',
        synced: true,
        output_count: outputs.length,
        abivc_response: responseData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[sync-output-to-abivc] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
