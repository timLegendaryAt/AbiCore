import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestRequest {
  action: "health" | "ping" | "sync_company" | "get_status";
  payload?: Record<string, unknown>;
  timestamp?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // Verify user authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("Missing or invalid Authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error("Failed to verify token:", claimsError);
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    console.log(`User ${userId} testing Abi platform connection`);

    // Check if user is an admin (optional - you can remove this if all authenticated users can test)
    const { data: isAdmin } = await supabase.rpc("is_platform_admin", { _user_id: userId });
    if (!isAdmin) {
      console.warn(`User ${userId} is not a platform admin`);
      // Allowing all authenticated users for now, but logging for audit
    }

    // Parse request body
    let body: TestRequest;
    try {
      body = await req.json();
    } catch {
      console.error("Failed to parse JSON body");
      return new Response(
        JSON.stringify({ error: "Bad Request", message: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate action field
    const validActions = ["health", "ping", "sync_company", "get_status"];
    if (!body.action || !validActions.includes(body.action)) {
      console.error("Invalid or missing action:", body.action);
      return new Response(
        JSON.stringify({ 
          error: "Bad Request", 
          message: `Invalid or missing action. Valid actions: ${validActions.join(", ")}` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the Abi platform secret
    const platformSecret = Deno.env.get("ABI_PLATFORM_SECRET");
    if (!platformSecret) {
      console.error("ABI_PLATFORM_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Configuration Error", message: "Platform secret not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call the Abi platform API
    const platformApiUrl = `${supabaseUrl}/functions/v1/abi-platform-api`;
    console.log(`Calling Abi platform API: ${body.action}`);

    const platformResponse = await fetch(platformApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-platform-secret": platformSecret
      },
      body: JSON.stringify({
        action: body.action,
        payload: body.payload,
        timestamp: body.timestamp
      })
    });

    const platformData = await platformResponse.json();

    if (!platformResponse.ok) {
      console.error("Abi Platform API error:", platformData);
      return new Response(
        JSON.stringify(platformData),
        { status: platformResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Abi Platform API ${body.action} succeeded`);
    return new Response(
      JSON.stringify(platformData),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal Server Error", 
        message: error instanceof Error ? error.message : "An unexpected error occurred" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
