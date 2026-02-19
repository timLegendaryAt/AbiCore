import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

// Version for deployment verification
const FUNCTION_VERSION = "2.5.0-2025-01-29";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SSOTChange {
  change_id: string;
  target_path: {
    l1: string;
    l2?: string;
    l3?: string;
    l4?: string;
  };
  target_level: "L2" | "L3" | "L4" | "L1C";
  action: "overwrite" | "append" | "create_field";
  data_type: string;
  is_scored: boolean;
  evaluation_method?: string;
  input_field_ids?: string[];
  value_to_write: any;
  current_value?: any;
  provenance?: {
    source: string;
    timestamp: string;
    author?: string;
  };
  notes?: string;
}

interface StructureAddition {
  type: "L2" | "L3";
  parent_path: { l1: string; l2?: string };
  field_key: string;
  display_name: string;
  field_type: string;
  is_scored: boolean;
  evaluation_method?: string;
  score_weight?: number;
}

interface SSOTChangePlan {
  plan_summary: string[];
  validated_changes: SSOTChange[];
  new_structure_additions: StructureAddition[];
  plan_exceptions: any[];
}

// Mapping mode: 'schema' (create fields only) or 'data' (write to existing only)
type MappingMode = 'schema' | 'data';

interface SSOTUpdateConfig {
  mode?: MappingMode;  // New explicit mode
  target_company_source: "current" | "from_input";
  auto_approve_l4: boolean;
  require_approval_create: boolean;
  schema_only?: boolean;  // Legacy - mapped to mode: 'schema'
}

// Helper to validate UUID format
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Filter array to only include valid UUIDs, return null if empty
function filterValidUUIDs(ids: string[] | undefined): string[] | null {
  if (!ids || ids.length === 0) return null;
  const validIds = ids.filter(isValidUUID);
  return validIds.length > 0 ? validIds : null;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Validate a single change against SSOT Data Standards
function validateChange(change: SSOTChange): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Rule: L4 never scored
  if (change.target_level === "L4" && change.is_scored) {
    errors.push("L4 (Input) fields cannot be scored");
  }

  // Rule: L1C never scored
  if (change.target_level === "L1C" && change.is_scored) {
    errors.push("L1C (Context) entries cannot be scored");
  }

  // Rule: L2 always scored
  if (change.target_level === "L2" && !change.is_scored) {
    errors.push("L2 (Primary Datapoint) must be scored");
  }

  // Rule: Scored fields need evaluation_method
  if (change.is_scored && !change.evaluation_method) {
    errors.push("Scored fields require evaluation_method");
  }

  // Rule: Scored fields need input_field_ids for lineage
  if (change.is_scored && (!change.input_field_ids || change.input_field_ids.length === 0)) {
    errors.push("Scored fields require input_field_ids for lineage");
  }

  // Rule: Data type compatibility - certain types only at L4
  const l4OnlyTypes = ["attribute_fact", "measurement", "evidence"];
  if (l4OnlyTypes.includes(change.data_type) && change.target_level !== "L4") {
    errors.push(`Data type "${change.data_type}" can only be stored at L4`);
  }

  // Rule: Provenance required for L4
  if (change.target_level === "L4" && !change.provenance?.source) {
    warnings.push("L4 inputs should include provenance source");
  }

  // Soft cap warning for L2 creation
  if (change.action === "create_field" && change.target_level === "L2") {
    warnings.push("Check L2 field count (soft cap: 5-7 per domain)");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// Validate structure additions
function validateStructureAddition(addition: StructureAddition): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // L2 must be scored
  if (addition.type === "L2" && !addition.is_scored) {
    errors.push("L2 fields must be scored");
  }

  // Scored L2/L3 need evaluation_method
  if (addition.is_scored && !addition.evaluation_method) {
    errors.push("Scored fields require evaluation_method");
  }

  // L2 soft cap
  if (addition.type === "L2") {
    warnings.push("Verify L2 field count stays within 5-7 per domain");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

serve(async (req) => {
  // Health check endpoint for deployment verification
  const url = new URL(req.url);
  if (url.searchParams.get("health") === "true") {
    return new Response(JSON.stringify({
      version: FUNCTION_VERSION,
      timestamp: new Date().toISOString(),
      status: "ok"
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log(`[execute-ssot-changes] Version ${FUNCTION_VERSION} starting`);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const {
      company_id,
      workflow_id,
      node_id,
      execution_run_id,
      plan,
      config,
    }: {
      company_id: string;
      workflow_id: string;
      node_id: string;
      execution_run_id?: string;
      plan: SSOTChangePlan;
      config?: SSOTUpdateConfig;
    } = await req.json();

    if (!company_id || !plan) {
      return new Response(
        JSON.stringify({ error: "company_id and plan are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[execute-ssot-changes] Processing plan for company ${company_id}`);
    console.log(`[execute-ssot-changes] Changes: ${plan.validated_changes?.length || 0}, Additions: ${plan.new_structure_additions?.length || 0}`);

    const results: any[] = [];
    const autoApproveL4 = config?.auto_approve_l4 ?? false;
    const requireApprovalCreate = config?.require_approval_create ?? true;
    
    // Resolve mode: new explicit mode takes precedence, then legacy schema_only fallback
    const mode: MappingMode = config?.mode || (config?.schema_only ? 'schema' : 'data');
    console.log(`[execute-ssot-changes] Mode: ${mode}, Auto-approve L4: ${autoApproveL4}, Require approval create: ${requireApprovalCreate}`);

    // Process validated changes
    for (const change of plan.validated_changes || []) {
      // Mode enforcement
      if (mode === 'schema' && change.action !== "create_field") {
        console.log(`[execute-ssot-changes] Schema mode: Rejecting ${change.action} action ${change.change_id}`);
        results.push({
          change_id: change.change_id,
          pending_change_id: null,
          validation_status: "invalid",
          errors: [`Schema mode: Only field creation allowed (rejecting "${change.action}" action)`],
          warnings: [],
        });
        continue;
      }
      
      if (mode === 'data' && change.action === "create_field") {
        console.log(`[execute-ssot-changes] Data mode: Rejecting create_field action ${change.change_id}`);
        results.push({
          change_id: change.change_id,
          pending_change_id: null,
          validation_status: "invalid",
          errors: [`Data mode: Cannot create new fields (use Schema mode for "${change.change_id}")`],
          warnings: [],
        });
        continue;
      }

      const validation = validateChange(change);

      // Determine if auto-approve applies
      const shouldAutoApprove = 
        autoApproveL4 && 
        change.target_level === "L4" && 
        change.action !== "create_field" &&
        validation.valid;

      // Build insert object - only include execution_run_id if provided
      const insertData: Record<string, any> = {
        company_id,
        workflow_id,
        node_id,
        change_id: change.change_id,
        target_level: change.target_level,
        target_domain: change.target_path.l1,
        target_path: change.target_path,
        action: change.action,
        data_type: change.data_type,
        is_scored: change.is_scored,
        evaluation_method: change.evaluation_method,
        input_field_ids: filterValidUUIDs(change.input_field_ids),
        current_value: change.current_value,
        proposed_value: change.value_to_write,
        provenance: change.provenance,
        validation_status: validation.valid ? "valid" : "invalid",
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
        status: !validation.valid ? "rejected" : (shouldAutoApprove ? "approved" : "pending"),
      };

      // NOTE: execution_run_id is intentionally omitted - the caller passes submission_id
      // which exists in company_data_submissions, not execution_runs (FK would fail)

      // Create pending change record
      const { data: pendingChange, error: insertError } = await supabase
        .from("ssot_pending_changes")
        .insert(insertData)
        .select()
        .single();

      if (insertError) {
        console.error(`[execute-ssot-changes] Error inserting change ${change.change_id}:`, insertError);
        results.push({
          change_id: change.change_id,
          error: insertError.message,
          validation_status: "invalid",
          errors: [insertError.message],
          warnings: [],
        });
        continue;
      }

      // Create system alert for pending changes (not auto-approved)
      if (validation.valid && !shouldAutoApprove) {
        const alertSeverity = change.action === "create_field" ? "warning" : "info";
        const pathDisplay = [
          change.target_path.l1,
          change.target_path.l2,
          change.target_path.l3,
          change.target_path.l4,
        ].filter(Boolean).join(" → ");

        const { data: alert, error: alertError } = await supabase
          .from("system_alerts")
          .insert({
            alert_type: "ssot_change_pending",
            severity: alertSeverity,
            title: `SSOT Change: ${change.change_id}`,
            description: `${change.action} at ${pathDisplay}`,
            affected_model: `ssot:${pendingChange.id}`,
            action_url: `/companies?pending_change=${pendingChange.id}`,
          })
          .select()
          .single();

        if (!alertError && alert) {
          // Link alert to pending change
          await supabase
            .from("ssot_pending_changes")
            .update({ alert_id: alert.id })
            .eq("id", pendingChange.id);

          results.push({
            change_id: change.change_id,
            pending_change_id: pendingChange.id,
            alert_id: alert.id,
            validation_status: "valid",
            errors: [],
            warnings: validation.warnings,
            auto_approved: false,
          });
        }
      } else if (shouldAutoApprove) {
        // Auto-approved - apply the change immediately
        console.log(`[execute-ssot-changes] Auto-approving L4 change ${change.change_id}`);
        
        // Apply to master data
        const applyResult = await applyChangeToSSOT(supabase, company_id, change, pendingChange.id);
        
        results.push({
          change_id: change.change_id,
          pending_change_id: pendingChange.id,
          validation_status: "valid",
          errors: applyResult.success ? [] : [applyResult.error || "Unknown error"],
          warnings: validation.warnings,
          auto_approved: true,
        });
      } else {
        // Invalid change - create warning alert
        const { data: alert } = await supabase
          .from("system_alerts")
          .insert({
            alert_type: "ssot_change_rejected",
            severity: "warning",
            title: `SSOT Change Rejected: ${change.change_id}`,
            description: `Validation failed: ${validation.errors.join(", ")}`,
            affected_model: `ssot:${pendingChange.id}`,
            action_url: `/companies?pending_change=${pendingChange.id}`,
          })
          .select()
          .single();

        if (alert) {
          await supabase
            .from("ssot_pending_changes")
            .update({ alert_id: alert.id })
            .eq("id", pendingChange.id);
        }

        results.push({
          change_id: change.change_id,
          pending_change_id: pendingChange.id,
          alert_id: alert?.id,
          validation_status: "invalid",
          errors: validation.errors,
          warnings: validation.warnings,
        });
      }
    }

    // Process structure additions
    for (const addition of plan.new_structure_additions || []) {
      const validation = validateStructureAddition(addition);
      const needsApproval = requireApprovalCreate || !validation.valid;

      // Build insert object for structure additions
      const structureInsertData: Record<string, any> = {
        company_id,
        workflow_id,
        node_id,
        change_id: `NEW-${addition.type}-${addition.field_key}`,
        target_level: addition.type,
        target_domain: addition.parent_path.l1,
        target_path: addition.parent_path,
        action: "create_field",
        data_type: "metric", // Structure additions are typically metrics
        is_scored: addition.is_scored,
        evaluation_method: addition.evaluation_method,
        proposed_value: {
          field_key: addition.field_key,
          display_name: addition.display_name,
          field_type: addition.field_type,
          score_weight: addition.score_weight,
        },
        validation_status: validation.valid ? "valid" : "invalid",
        validation_errors: validation.errors,
        validation_warnings: validation.warnings,
        status: validation.valid && !needsApproval ? "approved" : (validation.valid ? "pending" : "rejected"),
      };

      // NOTE: execution_run_id intentionally omitted (FK mismatch with submission_id)

      // Create a synthetic change record for structure additions
      const { data: pendingChange, error: insertError } = await supabase
        .from("ssot_pending_changes")
        .insert(structureInsertData)
        .select()
        .single();

      if (insertError) {
        console.error(`[execute-ssot-changes] Error inserting structure addition:`, insertError);
        continue;
      }

      // Create alert for structure additions
      if (validation.valid && needsApproval) {
        const { data: alert } = await supabase
          .from("system_alerts")
          .insert({
            alert_type: "ssot_structure_pending",
            severity: "warning",
            title: `New ${addition.type} Field: ${addition.display_name}`,
            description: `Create ${addition.type} field "${addition.field_key}" under ${addition.parent_path.l1}${addition.parent_path.l2 ? ` → ${addition.parent_path.l2}` : ""}`,
            affected_model: `ssot:${pendingChange.id}`,
            action_url: `/companies?pending_change=${pendingChange.id}`,
          })
          .select()
          .single();

        if (alert) {
          await supabase
            .from("ssot_pending_changes")
            .update({ alert_id: alert.id })
            .eq("id", pendingChange.id);
        }

        results.push({
          change_id: pendingChange.change_id,
          pending_change_id: pendingChange.id,
          alert_id: alert?.id,
          validation_status: "valid",
          errors: [],
          warnings: validation.warnings,
        });
      }
    }

    // Log plan exceptions
    for (const exception of plan.plan_exceptions || []) {
      console.log(`[execute-ssot-changes] Plan exception: ${exception.reason}`);
    }

    console.log(`[execute-ssot-changes] Completed. Processed ${results.length} changes.`);

    return new Response(
      JSON.stringify({
        success: true,
        changes_processed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[execute-ssot-changes] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Apply an approved change to the SSOT
async function applyChangeToSSOT(
  supabase: any,
  companyId: string,
  change: SSOTChange,
  pendingChangeId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check for create_field FIRST (regardless of level)
    if (change.action === "create_field") {
      const fieldData = change.value_to_write as {
        field_key: string;
        display_name: string;
        field_type: string;
        score_weight?: number;
      };

      const { error } = await supabase
        .from("company_field_definitions")
        .upsert({
          domain: change.target_path.l1,
          field_key: fieldData.field_key,
          display_name: fieldData.display_name,
          field_type: fieldData.field_type,
          level: change.target_level,
          is_scored: change.is_scored,
          evaluation_method: change.evaluation_method,
          score_weight: fieldData.score_weight || 1.0,
          parent_field_id: null,
        }, {
          onConflict: "domain,field_key",
        });

      if (error) {
        console.error(`[execute-ssot-changes] Error creating field definition:`, error);
        return { success: false, error: error.message };
      }
      
      console.log(`[execute-ssot-changes] Created field definition: ${fieldData.field_key}`);
    }
    // L1C (Context Facts) - never scored
    else if (change.target_level === "L1C") {
      const factKey = change.target_path.l4 
        || change.target_path.l3 
        || change.target_path.l2 
        || change.change_id;
      
      if (!factKey) {
        return { success: false, error: "No fact key found in target path" };
      }

      const { error } = await supabase
        .from("company_context_facts")
        .upsert({
          company_id: companyId,
          fact_key: factKey,
          fact_value: change.value_to_write,
          fact_type: change.data_type,
          category: "attribute",
          display_name: factKey.replace(/_/g, " ").replace(/\b\w/g, (l: string) => l.toUpperCase()),
          source_type: "generated",
          source_reference: change.provenance ? {
            pending_change_id: pendingChangeId,
            ...change.provenance,
          } : { pending_change_id: pendingChangeId },
        }, {
          onConflict: "company_id,fact_key",
        });

      if (error) {
        console.error(`[execute-ssot-changes] Error upserting context fact:`, error);
        return { success: false, error: error.message };
      }
      
      console.log(`[execute-ssot-changes] Upserted context fact: ${factKey}`);
    }
    // L2, L3, L4 all go to company_master_data
    else if (["L2", "L3", "L4"].includes(change.target_level)) {
      const fieldKey = change.target_path.l4 
        || change.target_path.l3 
        || change.target_path.l2 
        || change.change_id.replace("CHG-", "field_");
      
      if (!fieldKey) {
        return { success: false, error: "No field key found in target path" };
      }

      const { error } = await supabase
        .from("company_master_data")
        .upsert({
          company_id: companyId,
          domain: change.target_path.l1,
          field_key: fieldKey,
          field_value: change.value_to_write,
          field_type: change.data_type === "measurement" ? "number" : "text",
          source_type: "generated",
          source_reference: change.provenance ? {
            pending_change_id: pendingChangeId,
            ...change.provenance,
          } : { pending_change_id: pendingChangeId },
        }, {
          onConflict: "company_id,domain,field_key",
        });

      if (error) {
        console.error(`[execute-ssot-changes] Error upserting master data:`, error);
        return { success: false, error: error.message };
      }
      
      console.log(`[execute-ssot-changes] Upserted master data: ${change.target_path.l1}/${fieldKey}`);
      
      // Trigger SSOT sync to Abi after successful write
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      fetch(`${supabaseUrl}/functions/v1/sync-ssot-to-abi`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
        },
        body: JSON.stringify({
          company_id: companyId,
          sync_type: 'incremental',
          changed_domains: [change.target_path.l1],
          changed_fields: [{
            domain: change.target_path.l1,
            field_key: fieldKey,
            value: change.value_to_write,
            updated_at: new Date().toISOString()
          }]
        })
      }).catch(err => console.error('[execute-ssot-changes] Failed to trigger SSOT sync:', err));
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[execute-ssot-changes] Unexpected error in applyChangeToSSOT:`, error);
    return { success: false, error: errorMessage };
  }
}
