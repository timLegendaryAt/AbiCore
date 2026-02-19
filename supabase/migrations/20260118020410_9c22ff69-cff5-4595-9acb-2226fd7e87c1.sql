-- Fix provision_company_on_insert to use correct label path
CREATE OR REPLACE FUNCTION public.provision_company_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO company_node_data (company_id, workflow_id, node_id, node_type, node_label)
    SELECT 
        NEW.id,
        w.id,
        n->>'id',
        n->>'type',
        COALESCE(n->>'label', n->>'type')
    FROM workflows w,
    LATERAL jsonb_array_elements(w.nodes) AS n
    WHERE COALESCE(w.settings->>'data_attribution', 'company_data') 
          IN ('company_data', 'company_related_data')
    ON CONFLICT (company_id, workflow_id, node_id) DO NOTHING;
    
    RETURN NEW;
END;
$function$;

-- Fix provision_company_on_assignment to use correct label path
CREATE OR REPLACE FUNCTION public.provision_company_on_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.assigned_workflow_id IS DISTINCT FROM OLD.assigned_workflow_id THEN
        IF OLD.assigned_workflow_id IS NOT NULL THEN
            DELETE FROM company_node_data 
            WHERE company_id = NEW.id 
            AND workflow_id = OLD.assigned_workflow_id;
        END IF;
        
        IF NEW.assigned_workflow_id IS NOT NULL THEN
            INSERT INTO company_node_data (company_id, workflow_id, node_id, node_type, node_label)
            SELECT 
                NEW.id,
                NEW.assigned_workflow_id,
                n->>'id',
                n->>'type',
                COALESCE(n->>'label', n->>'type')
            FROM workflows w,
            LATERAL jsonb_array_elements(w.nodes) AS n
            WHERE w.id = NEW.assigned_workflow_id
            ON CONFLICT (company_id, workflow_id, node_id) DO NOTHING;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$function$;