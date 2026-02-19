-- Add primary display designation columns for L3 fields
ALTER TABLE company_field_definitions 
ADD COLUMN is_primary_score BOOLEAN DEFAULT false,
ADD COLUMN is_primary_description BOOLEAN DEFAULT false;

COMMENT ON COLUMN company_field_definitions.is_primary_score IS 
  'When true, this L3 field is the primary score for its parent L2 datapoint';
COMMENT ON COLUMN company_field_definitions.is_primary_description IS 
  'When true, this L3 field is the primary description for its parent L2 datapoint';