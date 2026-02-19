-- Drop existing triggers first
DROP TRIGGER IF EXISTS master_data_history_trigger ON company_master_data;
DROP TRIGGER IF EXISTS master_data_version_trigger ON company_master_data;

-- Create AFTER trigger for history tracking (parent row exists now)
CREATE TRIGGER master_data_history_trigger
  AFTER INSERT OR UPDATE ON company_master_data
  FOR EACH ROW
  EXECUTE FUNCTION track_master_data_changes();