import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const platforms = [
      {
        id: "abi",
        apiUrl: `${supabaseUrl}/functions/v1/abi-platform-api`,
        secretEnv: "ABI_PLATFORM_SECRET",
      },
      {
        id: "abivc",
        apiUrl: `${supabaseUrl}/functions/v1/abicore-platform-api`,
        secretEnv: "ABIVC_PLATFORM_SECRET",
      },
    ];

    const results = [];

    for (const platform of platforms) {
      const startTime = performance.now();
      let status = "healthy";
      let statusCode = 200;
      let errorMessage: string | null = null;
      let responseData: unknown = null;

      try {
        const secret = Deno.env.get(platform.secretEnv);
        if (!secret) {
          throw new Error(`${platform.secretEnv} not configured`);
        }

        const response = await fetch(platform.apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-platform-secret": secret,
          },
          body: JSON.stringify({ action: "health" }),
        });

        statusCode = response.status;
        
        try {
          responseData = await response.json();
        } catch {
          responseData = { raw: await response.text() };
        }

        if (!response.ok) {
          status = "error";
          errorMessage = (responseData as { error?: string })?.error || `HTTP ${statusCode}`;
        }
      } catch (error) {
        status = "error";
        errorMessage = error instanceof Error ? error.message : "Unknown error";
        statusCode = 0;
      }

      const responseTime = Math.round(performance.now() - startTime);

      // Store result
      const { error: insertError } = await supabase
        .from("integration_health_checks")
        .insert({
          integration_id: platform.id,
          status,
          response_time_ms: responseTime,
          status_code: statusCode,
          error_message: errorMessage,
          response_data: responseData,
          check_type: "scheduled",
        });

      if (insertError) {
        console.error(`Failed to insert health check for ${platform.id}:`, insertError);
      }

      // Create/update system alert if health check failed
      if (status === "error") {
        const { error: alertError } = await supabase.rpc("upsert_connection_alert", {
          _integration_id: platform.id,
          _error_message: errorMessage || "Unknown error",
          _status_code: statusCode,
        });

        if (alertError) {
          console.error(`Failed to create alert for ${platform.id}:`, alertError);
        }
      }

      results.push({
        platform: platform.id,
        status,
        statusCode,
        responseTime,
        error: errorMessage,
      });
    }

    console.log("Health check results:", JSON.stringify(results));

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Health check error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
