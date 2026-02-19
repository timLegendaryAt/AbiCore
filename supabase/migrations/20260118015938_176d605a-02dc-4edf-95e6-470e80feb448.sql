-- Step 1: Clean up misplaced company_node_data (from unrelated workflows)
DELETE FROM company_node_data 
WHERE workflow_id IN (
  SELECT id FROM workflows 
  WHERE COALESCE(settings->>'data_attribution', 'company_data') = 'unrelated_data'
);

-- Step 2: Clean up misplaced master_node_data (from company workflows)
DELETE FROM master_node_data 
WHERE workflow_id IN (
  SELECT id FROM workflows 
  WHERE COALESCE(settings->>'data_attribution', 'company_data') IN ('company_data', 'company_related_data')
);

-- Step 3: Re-provision company_node_data for company-relevant workflows
INSERT INTO company_node_data (company_id, workflow_id, node_id, node_type, node_label)
SELECT 
  c.id as company_id,
  w.id as workflow_id,
  node_elem->>'id' as node_id,
  node_elem->>'type' as node_type,
  COALESCE(node_elem->>'label', node_elem->>'type') as node_label
FROM workflows w
CROSS JOIN companies c
CROSS JOIN jsonb_array_elements(w.nodes) AS node_elem
WHERE COALESCE(w.settings->>'data_attribution', 'company_data') IN ('company_data', 'company_related_data')
ON CONFLICT (company_id, workflow_id, node_id) 
DO UPDATE SET
  node_type = EXCLUDED.node_type,
  node_label = EXCLUDED.node_label,
  updated_at = now();

-- Step 4: Re-provision master_node_data for unrelated workflows
INSERT INTO master_node_data (workflow_id, node_id, node_type, node_label)
SELECT 
  w.id as workflow_id,
  node_elem->>'id' as node_id,
  node_elem->>'type' as node_type,
  COALESCE(node_elem->>'label', node_elem->>'type') as node_label
FROM workflows w
CROSS JOIN jsonb_array_elements(w.nodes) AS node_elem
WHERE COALESCE(w.settings->>'data_attribution', 'company_data') = 'unrelated_data'
ON CONFLICT (workflow_id, node_id) 
DO UPDATE SET
  node_type = EXCLUDED.node_type,
  node_label = EXCLUDED.node_label,
  updated_at = now();