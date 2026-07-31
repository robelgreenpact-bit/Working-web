-- Add for_tax_registry column to requests table
-- Run this in your Supabase SQL editor

ALTER TABLE requests 
ADD COLUMN for_tax_registry BOOLEAN DEFAULT FALSE;

-- Add comment to document the purpose
COMMENT ON COLUMN requests.for_tax_registry IS 'Flag to indicate if an approved request should be sent to tax registry for registration';
