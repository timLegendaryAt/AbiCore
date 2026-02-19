import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-platform-secret",
};

// Structured error response helper for Abi integration
interface ErrorDetails {
  code: string;
  message: string;
  field?: string | null;
  received?: unknown;
}

function createErrorResponse(
  error: string,
  details: ErrorDetails,
  status: number
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error,
      details,
    }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Abi data structures - may differ from AbiVC
interface CompanyData {
  id: string;
  organization_id: string | null;
  name: string;
  industry: string | null;
  location: string | null;
  website: string | null;
  pitch_deck_url: string | null;
  contact_email: string | null;
  contact_name: string | null;
  description: string | null;
  notes: string | null;
  status: string | null;
  business_model: string | null;
  one_liner: string | null;
  revenue: string | null;
  arr: string | null;
  mrr: string | null;
  growth_rate: string | null;
  burn_rate: string | null;
  runway: string | null;
  gross_margin: string | null;
  net_margin: string | null;
  team_size: string | null;
  founding_year: string | null;
  funding_stage: string | null;
  total_raised: string | null;
  last_round_size: string | null;
  last_round_date: string | null;
  post_money_valuation: string | null;
  investor_names: string | null;
  target_raise: string | null;
  use_of_funds: string | null;
  target_customers: string | null;
  customer_count: string | null;
  competitors: string | null;
  competitive_advantage: string | null;
  traction_summary: string | null;
  key_metrics: string | null;
  tech_stack: string | null;
  intellectual_property: string | null;
  regulatory_considerations: string | null;
  exit_strategy: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  news_articles: string | null;
  founder_background: string | null;
  product_demo_url: string | null;
  data_room_url: string | null;
  source_channel: string | null;
  referrer: string | null;
  priority_level: string | null;
  logo_url: string | null;
  score: number | null;
  fit_score: number | null;
  risk_score: number | null;
  fit_score_summary: string | null;
  risk_score_summary: string | null;
  match_summary: string | null;
  source: string | null;
  score_pending: boolean;
  created_at: string;
  updated_at: string;
  num_shares_offered: number | null;
  price_per_share: number | null;
  minimum_investment: number | null;
  pre_money_valuation: number | null;
  state_of_incorporation: string | null;
}

// Flexible interface to handle Abi's actual structure
interface IntakeSubmission {
  field_label: string;
  field_type: string;
  response_value: { value?: unknown } | Record<string, unknown> | string | number | boolean;
  stage_name?: string;
  id?: string;
  company_id?: string;
  intake_stage_id?: string;
  intake_field_id?: string;
  created_at?: string;
  updated_at?: string;
}

// Company data may include intake_submissions nested inside
interface CompanyDataWithSubmissions extends CompanyData {
  intake_submissions?: IntakeSubmission[];
}

interface SyncCompanyPayload {
  company_uuid: string;
  company_data: CompanyDataWithSubmissions;
  intake_submissions?: IntakeSubmission[];
  synced_at: string;
}

interface PlatformRequest {
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
    return createErrorResponse(
      "Method not allowed",
      {
        code: "METHOD_NOT_ALLOWED",
        message: "Only POST requests are accepted",
        field: "method",
        received: req.method,
      },
      405
    );
  }

  try {
    // Validate platform secret - uses ABI_PLATFORM_SECRET
    const platformSecret = req.headers.get("x-platform-secret");
    const expectedSecret = Deno.env.get("ABI_PLATFORM_SECRET");

    if (!platformSecret || platformSecret !== expectedSecret) {
      console.error("Invalid or missing platform secret");
      return createErrorResponse(
        "Authentication failed",
        {
          code: "AUTH_ERROR",
          message: "Invalid or missing x-platform-secret header",
          field: "x-platform-secret",
          received: platformSecret ? "[REDACTED]" : null,
        },
        401
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let body: PlatformRequest;
    try {
      body = await req.json();
    } catch {
      console.error("Failed to parse JSON body");
      return createErrorResponse(
        "Invalid request body",
        {
          code: "PARSE_ERROR",
          message: "Request body must be valid JSON",
          field: "body",
          received: null,
        },
        400
      );
    }

    // Validate action field
    const validActions = ["health", "ping", "sync_company", "get_status"];
    if (!body.action || !validActions.includes(body.action)) {
      console.error("Invalid or missing action:", body.action);
      return createErrorResponse(
        "Invalid action",
        {
          code: "VALIDATION_ERROR",
          message: `Action must be one of: ${validActions.join(", ")}`,
          field: "action",
          received: body.action || null,
        },
        400
      );
    }

    const now = new Date().toISOString();
    console.log(`[Abi API] Processing action: ${body.action} at ${now}`);

    // Handle different actions
    switch (body.action) {
      case "health":
        return new Response(
          JSON.stringify({
            success: true,
            status: "healthy",
            platform: "abicore",
            source: "abi",
            version: "1.0.0",
            timestamp: now,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "ping":
        return new Response(
          JSON.stringify({
            success: true,
            message: "pong",
            source: "abi",
            timestamp: now,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "get_status":
        return new Response(
          JSON.stringify({
            success: true,
            connected: true,
            platform: "abicore",
            source: "abi",
            last_check: now,
            capabilities: ["health", "ping", "get_status", "sync_company"],
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case "sync_company": {
        const payload = body.payload as unknown as SyncCompanyPayload | undefined;
        
        // Validate required fields with detailed error responses
        const missingFields: string[] = [];
        if (!payload?.company_uuid) missingFields.push("company_uuid");
        if (!payload?.company_data) missingFields.push("company_data");
        
        if (missingFields.length > 0) {
          console.error("[Abi API] Missing required fields:", { 
            hasUuid: !!payload?.company_uuid, 
            hasData: !!payload?.company_data 
          });
          return createErrorResponse(
            `Missing required field: ${missingFields[0]}`,
            {
              code: "VALIDATION_ERROR",
              message: `The following fields are required: ${missingFields.join(", ")}`,
              field: missingFields[0],
              received: null,
            },
            400
          );
        }

        const { company_uuid, company_data, synced_at } = payload!;
        
        // Get intake_submissions - may be inside company_data or separate
        const intake_submissions = company_data.intake_submissions || payload!.intake_submissions || [];
        
        console.log(`[Abi API] Syncing company: ${company_data.name} (${company_uuid})`);
        console.log(`[Abi API] Intake submissions count: ${intake_submissions?.length || 0}`);
        console.log(`[Abi API] Intake submissions sample:`, JSON.stringify(intake_submissions?.slice(0, 2)));

        // Generate slug from company name
        const slug = company_data.name.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');

        // Step 1: Upsert company (create if new, update if exists)
        const { data: company, error: companyError } = await supabase
          .from('companies')
          .upsert({
            id: company_uuid,
            name: company_data.name,
            slug: slug,
            contact_email: company_data.contact_email,
            status: 'active',
            metadata: {
              abi_organization_id: company_data.organization_id,
              industry: company_data.industry,
              location: company_data.location,
              website: company_data.website,
              pitch_deck_url: company_data.pitch_deck_url,
              contact_name: company_data.contact_name,
              description: company_data.description,
              notes: company_data.notes,
              business_model: company_data.business_model,
              one_liner: company_data.one_liner,
              funding_stage: company_data.funding_stage,
              team_size: company_data.team_size,
              founding_year: company_data.founding_year,
              revenue: company_data.revenue,
              arr: company_data.arr,
              mrr: company_data.mrr,
              growth_rate: company_data.growth_rate,
              burn_rate: company_data.burn_rate,
              runway: company_data.runway,
              gross_margin: company_data.gross_margin,
              net_margin: company_data.net_margin,
              total_raised: company_data.total_raised,
              last_round_size: company_data.last_round_size,
              last_round_date: company_data.last_round_date,
              target_raise: company_data.target_raise,
              use_of_funds: company_data.use_of_funds,
              post_money_valuation: company_data.post_money_valuation,
              pre_money_valuation: company_data.pre_money_valuation,
              investor_names: company_data.investor_names,
              target_customers: company_data.target_customers,
              customer_count: company_data.customer_count,
              competitors: company_data.competitors,
              competitive_advantage: company_data.competitive_advantage,
              traction_summary: company_data.traction_summary,
              key_metrics: company_data.key_metrics,
              tech_stack: company_data.tech_stack,
              intellectual_property: company_data.intellectual_property,
              regulatory_considerations: company_data.regulatory_considerations,
              exit_strategy: company_data.exit_strategy,
              linkedin_url: company_data.linkedin_url,
              twitter_url: company_data.twitter_url,
              founder_background: company_data.founder_background,
              product_demo_url: company_data.product_demo_url,
              data_room_url: company_data.data_room_url,
              source_channel: company_data.source_channel,
              referrer: company_data.referrer,
              priority_level: company_data.priority_level,
              logo_url: company_data.logo_url,
              score: company_data.score,
              fit_score: company_data.fit_score,
              risk_score: company_data.risk_score,
              fit_score_summary: company_data.fit_score_summary,
              risk_score_summary: company_data.risk_score_summary,
              match_summary: company_data.match_summary,
              source: company_data.source,
              score_pending: company_data.score_pending,
              synced_from: 'abi',
              last_synced_at: synced_at || now,
            },
            updated_at: now,
          }, {
            onConflict: 'id'
          })
          .select()
          .single();

        if (companyError) {
          console.error("[Abi API] Failed to upsert company:", companyError);
          return createErrorResponse(
            "Company sync failed",
            {
              code: "DATABASE_ERROR",
              message: `Failed to upsert company: ${companyError.message}`,
              field: "company_data",
              received: company_data.name,
            },
            500
          );
        }

        console.log(`[Abi API] Company upserted: ${company.id}`);

        // Step 2: Build raw_data object combining company_data and intake_submissions
        const rawData: Record<string, unknown> = {
          ...company_data,
          intake_fields: {},
        };
        
        // Process intake submissions into a usable format
        if (intake_submissions && Array.isArray(intake_submissions)) {
          const intakeFields: Record<string, unknown> = {};
          for (const submission of intake_submissions) {
            // Extract actual value - may be wrapped in { value: ... }
            let actualValue: unknown;
            if (submission.response_value && typeof submission.response_value === 'object' && 'value' in submission.response_value) {
              actualValue = (submission.response_value as { value?: unknown }).value;
            } else {
              actualValue = submission.response_value;
            }
            
            intakeFields[submission.field_label] = {
              value: actualValue,
              type: submission.field_type,
              stage_name: submission.stage_name,
              field_id: submission.intake_field_id,
              stage_id: submission.intake_stage_id,
            };
          }
          rawData.intake_fields = intakeFields;
          console.log(`[Abi API] Processed ${Object.keys(intakeFields).length} intake fields`);
        }

        // Step 3: Create submission record for workflow processing
        const { data: submission, error: submissionError } = await supabase
          .from('company_data_submissions')
          .insert({
            company_id: company_uuid,
            raw_data: rawData,
            source_type: 'abi_sync',
            status: 'pending',
            metadata: { 
              synced_from: 'abi',
              synced_at: synced_at || now,
              intake_submission_count: intake_submissions?.length || 0,
            }
          })
          .select()
          .single();

        if (submissionError) {
          console.error("[Abi API] Failed to create submission:", submissionError);
          return createErrorResponse(
            "Company sync failed",
            {
              code: "DATABASE_ERROR",
              message: `Failed to create submission record: ${submissionError.message}`,
              field: "submission",
              received: null,
            },
            500
          );
        }

        console.log(`[Abi API] Created submission: ${submission.id}`);

        // Step 4: Trigger workflow execution
        let workflowsTriggered = 0;
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/run-company-workflows`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              company_id: company_uuid,
              submission_id: submission.id
            })
          });
          
          const workflowResult = await response.json();
          workflowsTriggered = workflowResult?.workflows_processed || 0;
          console.log("[Abi API] Workflow execution result:", JSON.stringify(workflowResult));
        } catch (workflowError) {
          console.error("[Abi API] Workflow execution failed:", workflowError);
          // Don't fail the sync - data is saved, workflows can be retried
        }

        // Return success response
        return new Response(
          JSON.stringify({
            success: true,
            message: "Company synced successfully",
            received_at: now,
            data: {
              company_id: company_uuid,
              submission_id: submission.id,
              workflows_triggered: workflowsTriggered,
            }
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return createErrorResponse(
          "Unknown action",
          {
            code: "VALIDATION_ERROR",
            message: "The specified action is not recognized",
            field: "action",
            received: body.action,
          },
          400
        );
    }
  } catch (error) {
    console.error("[Abi API] Unexpected error:", error);
    return createErrorResponse(
      "Internal server error",
      {
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
        field: null,
        received: null,
      },
      500
    );
  }
});
