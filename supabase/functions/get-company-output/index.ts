import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get API key from header
    const apiKey = req.headers.get('x-api-key');

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing X-API-Key header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate API key and get company
    const { data: companyId, error: companyError } = await supabase
      .rpc('get_company_by_api_key', { _api_key: apiKey });

    if (companyError || !companyId) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key or inactive company' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse query parameters
    const url = new URL(req.url);
    const outputId = url.searchParams.get('id');
    const submissionId = url.searchParams.get('submission_id');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const latest = url.searchParams.get('latest') === 'true';

    // Build query
    let query = supabase
      .from('company_outputs')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (outputId) {
      // Get specific output by ID
      query = query.eq('id', outputId);
    } else if (submissionId) {
      // Get outputs for specific submission
      query = query.eq('submission_id', submissionId);
    } else if (latest) {
      // Get only the latest output
      query = query.limit(1);
    } else {
      // Paginated list
      query = query.range(offset, offset + limit - 1);
    }

    const { data: outputs, error: outputsError, count } = await query;

    if (outputsError) {
      console.error('Error fetching outputs:', outputsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch outputs' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (outputId && (!outputs || outputs.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'Output not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If requesting a single output, return it directly
    if (outputId || latest) {
      return new Response(
        JSON.stringify(outputs?.[0] || null),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Return paginated list
    return new Response(
      JSON.stringify({
        outputs: outputs || [],
        pagination: {
          limit,
          offset,
          total: count,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Get output error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
