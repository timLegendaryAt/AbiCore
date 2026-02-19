-- Fix the provision_company_node_storage function to extract label from correct path
CREATE OR REPLACE FUNCTION public.provision_company_node_storage(_workflow_id uuid, _nodes jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _company record;
    _node jsonb;
    _data_attribution text;
BEGIN
    -- Get the workflow's data attribution setting
    SELECT COALESCE(settings->>'data_attribution', 'company_data') 
    INTO _data_attribution
    FROM workflows WHERE id = _workflow_id;
    
    -- Only provision company storage for company_data or company_related_data
    IF _data_attribution IN ('company_data', 'company_related_data') THEN
        -- For ALL companies
        FOR _company IN SELECT id FROM companies LOOP
            FOR _node IN SELECT * FROM jsonb_array_elements(_nodes) LOOP
                INSERT INTO company_node_data (
                    company_id, workflow_id, node_id, node_type, node_label
                )
                VALUES (
                    _company.id, _workflow_id,
                    _node->>'id', _node->>'type',
                    COALESCE(_node->>'label', _node->>'type')
                )
                ON CONFLICT (company_id, workflow_id, node_id) 
                DO UPDATE SET
                    node_type = EXCLUDED.node_type,
                    node_label = EXCLUDED.node_label,
                    updated_at = now();
            END LOOP;
        END LOOP;
        
        -- Clean up deleted nodes from company storage
        DELETE FROM company_node_data 
        WHERE workflow_id = _workflow_id
        AND node_id NOT IN (
            SELECT jsonb_array_elements(_nodes)->>'id'
        );
        
        -- Also clean up any orphaned master data for this workflow
        DELETE FROM master_node_data WHERE workflow_id = _workflow_id;
    ELSE
        -- For unrelated workflows, provision master storage instead
        FOR _node IN SELECT * FROM jsonb_array_elements(_nodes) LOOP
            INSERT INTO master_node_data (
                workflow_id, node_id, node_type, node_label
            )
            VALUES (
                _workflow_id,
                _node->>'id', _node->>'type',
                COALESCE(_node->>'label', _node->>'type')
            )
            ON CONFLICT (workflow_id, node_id) 
            DO UPDATE SET
                node_type = EXCLUDED.node_type,
                node_label = EXCLUDED.node_label,
                updated_at = now();
        END LOOP;
        
        -- Clean up deleted nodes from master
        DELETE FROM master_node_data 
        WHERE workflow_id = _workflow_id
        AND node_id NOT IN (
            SELECT jsonb_array_elements(_nodes)->>'id'
        );
        
        -- Also clean up any orphaned company data for this workflow
        DELETE FROM company_node_data WHERE workflow_id = _workflow_id;
    END IF;
END;
$function$;

-- Fix existing company_node_data records with correct labels from workflows
UPDATE company_node_data cnd
SET node_label = node_elem->>'label'
FROM workflows w,
     jsonb_array_elements(w.nodes) AS node_elem
WHERE cnd.workflow_id = w.id
  AND cnd.node_id = node_elem->>'id'
  AND node_elem->>'label' IS NOT NULL
  AND node_elem->>'label' != '';

-- Fix existing master_node_data records with correct labels from workflows  
UPDATE master_node_data mnd
SET node_label = node_elem->>'label'
FROM workflows w,
     jsonb_array_elements(w.nodes) AS node_elem
WHERE mnd.workflow_id = w.id
  AND mnd.node_id = node_elem->>'id'
  AND node_elem->>'label' IS NOT NULL
  AND node_elem->>'label' != '';