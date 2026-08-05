-- Add quantity column to assets table
-- Run this in your Supabase SQL editor

ALTER TABLE assets 
ADD COLUMN quantity INTEGER;

-- Add comment to document the purpose
COMMENT ON COLUMN assets.quantity IS 'Quantity for furniture items that have multiple identical pieces';
