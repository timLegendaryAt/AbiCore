import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pollCrawlJob(jobId: string, apiKey: string, maxWaitMs = 120000): Promise<any> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds
  
  while (Date.now() - startTime < maxWaitMs) {
    const response = await fetch(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    
    const data = await response.json();
    console.log(`Crawl job ${jobId} status: ${data.status}, pages: ${data.completed || 0}/${data.total || '?'}`);
    
    if (data.status === 'completed') {
      return data;
    }
    
    if (data.status === 'failed') {
      throw new Error(`Crawl job failed: ${data.error || 'Unknown error'}`);
    }
    
    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  throw new Error(`Crawl job timed out after ${maxWaitMs / 1000} seconds`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      capability, 
      input, 
      options, 
      companyId, 
      workflowId, 
      nodeId,
      nodeLabel 
    } = await req.json();

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured. Please connect Firecrawl in Settings → Integrations.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!capability || !input) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing capability or input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL if needed
    let formattedInput = input.trim();
    if (capability !== 'search' && !formattedInput.startsWith('http://') && !formattedInput.startsWith('https://')) {
      formattedInput = `https://${formattedInput}`;
    }

    console.log(`Firecrawl ${capability}:`, formattedInput);

    let firecrawlResponse: Response;
    let endpoint: string;
    let body: Record<string, any>;

    switch (capability) {
      case 'scrape':
        endpoint = 'https://api.firecrawl.dev/v1/scrape';
        body = {
          url: formattedInput,
          formats: options?.formats || ['markdown'],
          onlyMainContent: options?.onlyMainContent ?? true,
          waitFor: options?.waitFor,
        };
        break;

      case 'search':
        endpoint = 'https://api.firecrawl.dev/v1/search';
        body = {
          query: formattedInput,
          limit: options?.limit || 10,
          lang: options?.lang,
          country: options?.country,
          tbs: options?.tbs,
          scrapeOptions: options?.scrapeOptions,
        };
        break;

      case 'map':
        endpoint = 'https://api.firecrawl.dev/v1/map';
        body = {
          url: formattedInput,
          search: options?.search,
          limit: options?.limit || 100,
          includeSubdomains: options?.includeSubdomains ?? false,
        };
        break;

      case 'crawl': {
        endpoint = 'https://api.firecrawl.dev/v1/crawl';
        body = {
          url: formattedInput,
          limit: options?.limit || 50,
          maxDepth: options?.maxDepth || 3,
          includePaths: options?.includePaths,
          excludePaths: options?.excludePaths,
          scrapeOptions: { formats: ['markdown', 'html'] },
        };
        
        // Crawl is async - start job then poll for completion
        const crawlResponse = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        
        const crawlData = await crawlResponse.json();
        
        if (!crawlResponse.ok) {
          console.error('Firecrawl crawl start error:', crawlData);
          return new Response(
            JSON.stringify({ success: false, error: crawlData.error || 'Failed to start crawl' }),
            { status: crawlResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        console.log(`Crawl job started: ${crawlData.id}`);
        
        // Poll until complete
        const completedData = await pollCrawlJob(crawlData.id, apiKey);
        
        // Extract output from completed crawl
        const crawlOutput = (completedData.data || []).map((page: any) => 
          `# ${page.metadata?.title || page.metadata?.sourceURL || 'Page'}\n\n${page.markdown || page.html || ''}`
        ).join('\n\n---\n\n');
        
        // Store in company_node_data if we have the IDs
        if (companyId && workflowId && nodeId) {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
          const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
          const supabase = createClient(supabaseUrl, supabaseKey);

          const contentHash = await hashContent(crawlOutput);

          await supabase.from('company_node_data').upsert({
            company_id: companyId,
            workflow_id: workflowId,
            node_id: nodeId,
            node_type: 'integration',
            node_label: nodeLabel || null,
            data: { output: crawlOutput, raw: completedData, capability, input: formattedInput },
            content_hash: contentHash,
            last_executed_at: new Date().toISOString(),
            version: 1,
          }, { 
            onConflict: 'company_id,workflow_id,node_id' 
          });

          console.log(`Stored crawl result for company ${companyId}, node ${nodeId}`);
        }

        console.log(`Firecrawl crawl successful, output length: ${crawlOutput.length}`);
        
        return new Response(
          JSON.stringify({ success: true, output: crawlOutput, raw: completedData }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown capability: ${capability}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    firecrawlResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await firecrawlResponse.json();

    if (!firecrawlResponse.ok) {
      console.error('Firecrawl API error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || `Request failed with status ${firecrawlResponse.status}` }),
        { status: firecrawlResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract the primary output based on capability
    let output: string;
    switch (capability) {
      case 'scrape':
        // Prefer markdown, fallback to html, then summary
        output = data.data?.markdown || data.data?.html || data.data?.summary || JSON.stringify(data.data);
        break;
      case 'search':
        // Format search results as readable text
        output = (data.data || []).map((result: any, i: number) => 
          `[${i + 1}] ${result.title}\n${result.url}\n${result.description || ''}\n${result.markdown || ''}`
        ).join('\n\n---\n\n');
        break;
      case 'map':
        // Return URLs as newline-separated list
        output = (data.links || data.data || []).join('\n');
        break;
      case 'crawl':
        // Combine all crawled page content
        output = (data.data || []).map((page: any) => 
          `# ${page.metadata?.title || page.metadata?.sourceURL || 'Page'}\n\n${page.markdown || page.html || ''}`
        ).join('\n\n---\n\n');
        break;
      default:
        output = JSON.stringify(data);
    }

    // Store in company_node_data if we have the IDs
    if (companyId && workflowId && nodeId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const contentHash = await hashContent(output);

      await supabase.from('company_node_data').upsert({
        company_id: companyId,
        workflow_id: workflowId,
        node_id: nodeId,
        node_type: 'integration',
        node_label: nodeLabel || null,
        data: { output, raw: data, capability, input: formattedInput },
        content_hash: contentHash,
        last_executed_at: new Date().toISOString(),
        version: 1,
      }, { 
        onConflict: 'company_id,workflow_id,node_id' 
      });

      console.log(`Stored ${capability} result for company ${companyId}, node ${nodeId}`);
    }

    console.log(`Firecrawl ${capability} successful, output length: ${output.length}`);
    
    return new Response(
      JSON.stringify({ success: true, output, raw: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in firecrawl-execute:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to execute Firecrawl';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
