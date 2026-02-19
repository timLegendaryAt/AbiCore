-- Update provision_company_node_storage to provision for ALL companies
CREATE OR REPLACE FUNCTION public.provision_company_node_storage(_workflow_id uuid, _nodes jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    _company record;
    _node jsonb;
BEGIN
    -- For ALL companies (not just those assigned to this workflow)
    FOR _company IN 
        SELECT id FROM companies
    LOOP
        -- For each node in the workflow
        FOR _node IN SELECT * FROM jsonb_array_elements(_nodes)
        LOOP
            -- Insert or update node data entry
            INSERT INTO company_node_data (
                company_id, 
                workflow_id, 
                node_id, 
                node_type, 
                node_label
            )
            VALUES (
                _company.id,
                _workflow_id,
                _node->>'id',
                _node->>'type',
                COALESCE(_node->'data'->>'label', _node->>'type')
            )
            ON CONFLICT (company_id, workflow_id, node_id) 
            DO UPDATE SET
                node_type = EXCLUDED.node_type,
                node_label = EXCLUDED.node_label,
                updated_at = now();
        END LOOP;
    END LOOP;
    
    -- Clean up deleted nodes (nodes that are no longer in the workflow)
    DELETE FROM company_node_data 
    WHERE workflow_id = _workflow_id
    AND node_id NOT IN (
        SELECT jsonb_array_elements(_nodes)->>'id'
    );
END;
$$;

-- Create trigger function for company INSERT
CREATE OR REPLACE FUNCTION public.provision_company_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- For the new company, create node data entries for ALL workflow nodes
    INSERT INTO company_node_data (company_id, workflow_id, node_id, node_type, node_label)
    SELECT 
        NEW.id,
        w.id,
        n->>'id',
        n->>'type',
        COALESCE(n->'data'->>'label', n->>'type')
    FROM workflows w,
    LATERAL jsonb_array_elements(w.nodes) AS n
    ON CONFLICT (company_id, workflow_id, node_id) DO NOTHING;
    
    RETURN NEW;
END;
$$;

-- Create trigger on company insert
DROP TRIGGER IF EXISTS on_company_insert ON public.companies;
CREATE TRIGGER on_company_insert
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.provision_company_on_insert();