-- Create RPC function to aggregate AI costs per company
CREATE OR REPLACE FUNCTION get_company_cost_summaries()
RETURNS TABLE(
  company_id uuid,
  total_cost numeric,
  generation_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    al.company_id,
    COALESCE(SUM(al.estimated_cost::numeric), 0) as total_cost,
    COUNT(*) as generation_count
  FROM ai_usage_logs al
  WHERE al.company_id IS NOT NULL
  GROUP BY al.company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;