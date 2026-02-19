-- Create master_node_data for unrelated workflow outputs (global, not per-company)
CREATE TABLE public.master_node_data (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    node_id text NOT NULL,
    node_type text NOT NULL,
    node_label text,
    data jsonb DEFAULT '{}'::jsonb,
    content_hash text,
    dependency_hashes jsonb DEFAULT '{}',
    last_executed_at timestamptz,
    version integer DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(workflow_id, node_id)
);

-- Add RLS policies
ALTER TABLE public.master_node_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage master node data"
ON public.master_node_data FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- Update provision_company_node_storage to check data_attribution before provisioning
CREATE OR REPLACE FUNCTION public.provision_company_node_storage(_workflow_id uuid, _nodes jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
                    COALESCE(_node->'data'->>'label', _node->>'type')
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
                COALESCE(_node->'data'->>'label', _node->>'type')
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
$$;

-- Update provision_company_on_insert to only provision company-relevant workflows
CREATE OR REPLACE FUNCTION public.provision_company_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Only provision for workflows with company_data or company_related_data
    INSERT INTO company_node_data (company_id, workflow_id, node_id, node_type, node_label)
    SELECT 
        NEW.id,
        w.id,
        n->>'id',
        n->>'type',
        COALESCE(n->'data'->>'label', n->>'type')
    FROM workflows w,
    LATERAL jsonb_array_elements(w.nodes) AS n
    WHERE COALESCE(w.settings->>'data_attribution', 'company_data') 
          IN ('company_data', 'company_related_data')
    ON CONFLICT (company_id, workflow_id, node_id) DO NOTHING;
    
    RETURN NEW;
END;
$$;