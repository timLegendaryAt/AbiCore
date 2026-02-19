-- Workflow Audit Log Table
-- Tracks all workflow modifications to enable recovery and investigation of data loss

CREATE TABLE workflow_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'rename')),
  old_name TEXT,
  new_name TEXT,
  old_node_count INTEGER,
  new_node_count INTEGER,
  old_edge_count INTEGER,
  new_edge_count INTEGER,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL CHECK (source IN ('user', 'autosave', 'beacon', 'migration', 'api')),
  client_transaction_id TEXT,
  node_id_hash TEXT,  -- MD5 hash of sorted node IDs for quick comparison
  suspicious_change BOOLEAN DEFAULT false,  -- Flag for potential overwrites
  overlap_ratio NUMERIC(5,4),  -- Node ID overlap ratio (0.0 to 1.0)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_workflow_audit_workflow_id ON workflow_audit_log(workflow_id);
CREATE INDEX idx_workflow_audit_changed_at ON workflow_audit_log(changed_at DESC);
CREATE INDEX idx_workflow_audit_suspicious ON workflow_audit_log(suspicious_change) WHERE suspicious_change = true;

-- Enable RLS
ALTER TABLE workflow_audit_log ENABLE ROW LEVEL SECURITY;

-- Platform admins can manage audit logs
CREATE POLICY "Platform admins can manage workflow audit logs"
ON workflow_audit_log
FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- Authenticated users can view audit logs (for debugging)
CREATE POLICY "Authenticated users can view workflow audit logs"
ON workflow_audit_log
FOR SELECT
USING (auth.uid() IS NOT NULL);

COMMENT ON TABLE workflow_audit_log IS 'Tracks all workflow modifications to enable recovery and investigation of data loss from race conditions';
COMMENT ON COLUMN workflow_audit_log.suspicious_change IS 'True when node overlap ratio suggests potential overwrite from race condition';
COMMENT ON COLUMN workflow_audit_log.overlap_ratio IS 'Ratio of overlapping node IDs between old and new versions (0.0 = completely different, 1.0 = identical)';