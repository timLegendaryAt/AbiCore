-- Create entities table
CREATE TABLE public.entities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    entity_type text NOT NULL DEFAULT 'external_platform',
    description text,
    icon_name text,
    color text,
    metadata jsonb DEFAULT '{}',
    settings jsonb DEFAULT '{}',
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create entity_node_data table (mirrors company_node_data structure)
CREATE TABLE public.entity_node_data (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
    workflow_id uuid NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
    node_id text NOT NULL,
    node_type text NOT NULL,
    node_label text,
    data jsonb DEFAULT '{}',
    content_hash text,
    dependency_hashes jsonb DEFAULT '{}',
    last_executed_at timestamptz,
    version integer DEFAULT 1,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(entity_id, workflow_id, node_id)
);

-- Enable RLS
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_node_data ENABLE ROW LEVEL SECURITY;

-- RLS policies for entities
CREATE POLICY "Authenticated users can view entities"
ON public.entities FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Platform admins can manage entities"
ON public.entities FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- RLS policies for entity_node_data
CREATE POLICY "Authenticated users can view entity node data"
ON public.entity_node_data FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Platform admins can manage entity node data"
ON public.entity_node_data FOR ALL
USING (is_platform_admin(auth.uid()))
WITH CHECK (is_platform_admin(auth.uid()));

-- Seed initial entities
INSERT INTO public.entities (name, slug, entity_type, description, icon_name, color) VALUES
  ('AbiVC', 'abivc', 'external_platform', 'AbiVC integration platform', 'Building2', '#3B82F6'),
  ('Abi', 'abi', 'external_platform', 'Abi platform integration', 'Building2', '#10B981');

-- Create or replace the provision function to handle entity data
CREATE OR REPLACE FUNCTION public.provision_entity_node_storage(_workflow_id uuid, _entity_id uuid, _nodes jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    _node jsonb;
BEGIN
    -- Provision storage for each node
    FOR _node IN SELECT * FROM jsonb_array_elements(_nodes) LOOP
        INSERT INTO entity_node_data (
            entity_id, workflow_id, node_id, node_type, node_label
        )
        VALUES (
            _entity_id, _workflow_id,
            _node->>'id', _node->>'type',
            COALESCE(_node->>'label', _node->>'type')
        )
        ON CONFLICT (entity_id, workflow_id, node_id) 
        DO UPDATE SET
            node_type = EXCLUDED.node_type,
            node_label = EXCLUDED.node_label,
            updated_at = now();
    END LOOP;
    
    -- Clean up deleted nodes
    DELETE FROM entity_node_data 
    WHERE workflow_id = _workflow_id
    AND entity_id = _entity_id
    AND node_id NOT IN (
        SELECT jsonb_array_elements(_nodes)->>'id'
    );
END;
$$;

-- Create index for faster queries
CREATE INDEX idx_entity_node_data_entity_workflow ON public.entity_node_data(entity_id, workflow_id);
CREATE INDEX idx_entities_slug ON public.entities(slug);