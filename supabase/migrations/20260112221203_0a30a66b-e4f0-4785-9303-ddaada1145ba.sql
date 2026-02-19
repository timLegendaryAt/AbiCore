-- Create company_node_data table for per-company, per-node storage
CREATE TABLE public.company_node_data (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    node_id text NOT NULL,
    node_type text NOT NULL,
    node_label text,
    data jsonb DEFAULT '{}'::jsonb,
    version integer DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(company_id, workflow_id, node_id)
);

-- Enable RLS
ALTER TABLE public.company_node_data ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Platform admins can manage all node data"
ON public.company_node_data FOR ALL TO authenticated
USING (public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE POLICY "Company members can view their node data"
ON public.company_node_data FOR SELECT TO authenticated
USING (public.is_company_member(auth.uid(), company_id));

-- Index for fast lookups
CREATE INDEX idx_company_node_data_lookup ON public.company_node_data(company_id, workflow_id, node_id);
CREATE INDEX idx_company_node_data_workflow ON public.company_node_data(workflow_id);

-- Function to provision node storage for all companies assigned to a workflow
CREATE OR REPLACE FUNCTION public.provision_company_node_storage(
    _workflow_id uuid,
    _nodes jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    _company record;
    _node jsonb;
BEGIN
    -- For each company assigned to this workflow
    FOR _company IN 
        SELECT id FROM companies WHERE assigned_workflow_id = _workflow_id
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

-- Trigger function to provision storage when company is assigned to a workflow
CREATE OR REPLACE FUNCTION public.provision_company_on_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- Only act when assigned_workflow_id changes
    IF NEW.assigned_workflow_id IS DISTINCT FROM OLD.assigned_workflow_id THEN
        -- Delete old node data if workflow changed
        IF OLD.assigned_workflow_id IS NOT NULL THEN
            DELETE FROM company_node_data 
            WHERE company_id = NEW.id 
            AND workflow_id = OLD.assigned_workflow_id;
        END IF;
        
        -- Provision new workflow nodes
        IF NEW.assigned_workflow_id IS NOT NULL THEN
            INSERT INTO company_node_data (company_id, workflow_id, node_id, node_type, node_label)
            SELECT 
                NEW.id,
                NEW.assigned_workflow_id,
                n->>'id',
                n->>'type',
                COALESCE(n->'data'->>'label', n->>'type')
            FROM workflows w,
            LATERAL jsonb_array_elements(w.nodes) AS n
            WHERE w.id = NEW.assigned_workflow_id
            ON CONFLICT (company_id, workflow_id, node_id) DO NOTHING;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger on companies table
CREATE TRIGGER on_company_workflow_assignment
AFTER UPDATE ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.provision_company_on_assignment();

-- Update trigger for updated_at
CREATE TRIGGER update_company_node_data_updated_at
BEFORE UPDATE ON public.company_node_data
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();