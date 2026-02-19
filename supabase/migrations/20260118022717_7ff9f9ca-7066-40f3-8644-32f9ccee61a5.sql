-- Add profile column to integrations table
ALTER TABLE integrations 
ADD COLUMN profile TEXT DEFAULT 'main';

-- Add constraint for valid values
ALTER TABLE integrations
ADD CONSTRAINT integrations_profile_check 
CHECK (profile IN ('main', 'abi', 'abivc'));