-- Add serial_number column to assets table
ALTER TABLE assets 
ADD COLUMN serial_number TEXT;

-- Add comment to describe the field
COMMENT ON COLUMN assets.serial_number IS 'Serial number for tracking electronics and other items with unique identifiers';
