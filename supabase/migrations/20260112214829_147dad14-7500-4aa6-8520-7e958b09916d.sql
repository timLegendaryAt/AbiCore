-- Fix the generate_org_api_key function to properly reference pgcrypto from extensions schema
CREATE OR REPLACE FUNCTION public.generate_org_api_key()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF NEW.api_key IS NULL THEN
        NEW.api_key := 'org_' || encode(extensions.gen_random_bytes(24), 'hex');
    END IF;
    RETURN NEW;
END;
$$;