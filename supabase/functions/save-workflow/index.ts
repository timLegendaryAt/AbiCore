import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Calculate MD5-like hash of sorted node IDs for quick comparison
function hashNodeIds(nodes: any[]): string {
  if (!nodes || nodes.length === 0) return '';
  const sortedIds = nodes.map(n => n.id).sort().join(',');
  // Simple hash for comparison
  let hash = 0;
  for (let i = 0; i < sortedIds.length; i++) {
    const char = sortedIds.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// Calculate overlap ratio between two sets of node IDs
function calculateOverlapRatio(currentNodes: any[], newNodes: any[]): number {
  if (!currentNodes?.length || !newNodes?.length) return 1.0;
  
  const currentIds = new Set(currentNodes.map(n => n.id));
  const newIds = new Set(newNodes.map(n => n.id));
  
  let intersectionCount = 0;
  for (const id of currentIds) {
    if (newIds.has(id)) intersectionCount++;
  }
  
  const maxSize = Math.max(currentIds.size, newIds.size);
  return maxSize > 0 ? intersectionCount / maxSize : 1.0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { 
      id, 
      name, 
      description, 
      nodes, 
      edges, 
      variables, 
      parent_id, 
      sort_order, 
      is_expanded, 
      settings,
      expected_version,  // For optimistic locking
      _source,           // 'user' | 'autosave' | 'beacon' | 'structural' | 'queue-*'
      _transaction_id,   // Client transaction ID for audit trail
      _identity_name,    // IDENTITY BINDING: Workflow name at load time
      _identity_token,   // IDENTITY BINDING: Session token for this load
    } = body;

    const source = _source || 'api';
    
    // Log queue-based saves for debugging the new architecture
    if (_transaction_id?.startsWith('queue-')) {
      console.log(`[save-workflow] Queue-based save for ${id}, source: ${source}`);
    }
    
    let result;

    if (id) {
      // ======== UPDATE EXISTING WORKFLOW ========
      
      // Fetch current workflow for comparison and version check
      const { data: current, error: fetchError } = await supabase
        .from('workflows')
        .select('id, name, nodes, edges, version')
        .eq('id', id)
        .single();

      if (fetchError) {
        console.error('Error fetching current workflow:', fetchError);
        throw fetchError;
      }

      // ============ IDENTITY BINDING VALIDATION ============
      // This is the CRITICAL protection against cross-workflow contamination
      // If the client sends an identity name and it doesn't match the DB name,
      // the client is trying to save stale/wrong data to this workflow
      if (_identity_name && current?.name !== _identity_name) {
        console.error('🛑 IDENTITY MISMATCH - blocking save', {
          workflowId: id,
          currentDbName: current?.name,
          identityName: _identity_name,
          attemptedSaveName: name,
          source,
          transactionId: _transaction_id,
          identityToken: _identity_token?.slice(0, 8) + '...',
        });
        
        return new Response(JSON.stringify({
          error: 'Blocked: Workflow identity mismatch. The workflow was modified by another operation.',
          code: 'IDENTITY_MISMATCH',
          details: {
            expectedName: _identity_name,
            currentDbName: current?.name,
            attemptedSaveName: name,
          }
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const currentNodeCount = current?.nodes?.length || 0;
      const newNodeCount = nodes?.length || 0;
      const currentEdgeCount = current?.edges?.length || 0;
      const newEdgeCount = edges?.length || 0;

      // Calculate overlap ratio
      const overlapRatio = calculateOverlapRatio(current?.nodes || [], nodes || []);
      
      // Detect suspicious overwrites:
      // - Both have substantial nodes (>5)
      // - Very low overlap (<10%)
      const isSuspicious = 
        currentNodeCount > 5 && 
        newNodeCount > 5 && 
        overlapRatio < 0.1;

      // CRITICAL: Also detect name changes with completely different node sets
      // This catches cross-workflow contamination
      const isNameChange = current?.name !== name;
      const isContentSwap = isNameChange && overlapRatio < 0.5 && currentNodeCount > 3 && newNodeCount > 3;

      if (isSuspicious || isContentSwap) {
        console.error('🚨 SUSPICIOUS OVERWRITE DETECTED', {
          workflowId: id,
          currentName: current?.name,
          newName: name,
          currentNodeCount,
          newNodeCount,
          overlapRatio: overlapRatio.toFixed(4),
          source,
          transactionId: _transaction_id,
          isNameChange,
          isContentSwap
        });
      }

      // Always log to audit table for updates
      const auditEntry = {
        workflow_id: id,
        action: current?.name !== name ? 'rename' : 'update',
        old_name: current?.name,
        new_name: name,
        old_node_count: currentNodeCount,
        new_node_count: newNodeCount,
        old_edge_count: currentEdgeCount,
        new_edge_count: newEdgeCount,
        source,
        client_transaction_id: _transaction_id || null,
        node_id_hash: hashNodeIds(nodes),
        suspicious_change: isSuspicious || isContentSwap,
        overlap_ratio: overlapRatio
      };

      // Insert audit log (non-blocking)
      supabase.from('workflow_audit_log').insert(auditEntry)
        .then(({ error }) => {
          if (error) console.error('Failed to write audit log:', error);
        });

      // Optimistic locking: If client sends expected_version, verify it matches
      if (expected_version !== undefined && current?.version !== expected_version) {
        console.warn('Version mismatch', { 
          expected: expected_version, 
          current: current?.version,
          workflowId: id 
        });
        return new Response(JSON.stringify({ 
          error: 'Conflict: workflow was modified by another operation',
          currentVersion: current?.version,
          code: 'VERSION_MISMATCH'
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // BLOCK ALL suspicious overwrites - regardless of source
      // Previously we only blocked beacon/autosave, but cross-contamination can come from any source
      if (isSuspicious || isContentSwap) {
        console.error('🛑 BLOCKING suspicious overwrite:', {
          source,
          currentName: current?.name,
          newName: name,
          overlapRatio: overlapRatio.toFixed(4)
        });
        return new Response(JSON.stringify({ 
          error: 'Blocked: Suspicious overwrite detected. This appears to be cross-workflow contamination.',
          code: 'SUSPICIOUS_OVERWRITE',
          details: {
            currentName: current?.name,
            attemptedName: name,
            currentNodeCount,
            newNodeCount,
            overlapRatio: overlapRatio.toFixed(4)
          }
        }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Perform the update with optimistic locking
      const currentVersion = current?.version || 1;
      const { data, error } = await supabase
        .from('workflows')
        .update({
          name,
          description,
          nodes,
          edges,
          variables,
          parent_id,
          sort_order,
          is_expanded,
          settings,
          version: currentVersion + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('version', currentVersion)  // Optimistic lock
        .select()
        .single();

      if (error) {
        // Check if it's a version conflict (no rows updated)
        if (error.code === 'PGRST116') {
          return new Response(JSON.stringify({ 
            error: 'Conflict: workflow was modified by another operation',
            code: 'VERSION_CONFLICT'
          }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        throw error;
      }
      result = data;
    } else {
      // ======== CREATE NEW WORKFLOW ========
      const { data, error } = await supabase
        .from('workflows')
        .insert({
          name,
          description,
          nodes,
          edges,
          variables,
          parent_id,
          sort_order,
          is_expanded,
          settings,
          user_id: null, // No user authentication for demo
        })
        .select()
        .single();

      if (error) throw error;
      result = data;

      // Log creation to audit
      supabase.from('workflow_audit_log').insert({
        workflow_id: result.id,
        action: 'create',
        new_name: name,
        new_node_count: nodes?.length || 0,
        new_edge_count: edges?.length || 0,
        source,
        client_transaction_id: _transaction_id || null,
        node_id_hash: hashNodeIds(nodes),
        suspicious_change: false,
        overlap_ratio: null
      }).then(({ error }) => {
        if (error) console.error('Failed to write creation audit log:', error);
      });
    }

    // Provision node storage based on data attribution
    const dataAttribution = settings?.data_attribution || 'company_data';
    
    if (dataAttribution === 'entity_data' && settings?.assigned_entity_id) {
      // Provision entity node storage
      const { error: entityProvisionError } = await supabase.rpc('provision_entity_node_storage', {
        _workflow_id: result.id,
        _entity_id: settings.assigned_entity_id,
        _nodes: result.nodes
      });

      if (entityProvisionError) {
        console.error('Error provisioning entity node storage:', entityProvisionError);
      }
    } else {
      // Provision company node storage (existing behavior)
      const { error: provisionError } = await supabase.rpc('provision_company_node_storage', {
        _workflow_id: result.id,
        _nodes: result.nodes
      });

      if (provisionError) {
        console.error('Error provisioning company node storage:', provisionError);
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in save-workflow:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
