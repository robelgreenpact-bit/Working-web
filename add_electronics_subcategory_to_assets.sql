-- Add electronics_subcategory column to assets table
-- Run this in your Supabase SQL editor

ALTER TABLE assets 
ADD COLUMN electronics_subcategory VARCHAR(50);

-- Add comment to document the purpose
COMMENT ON COLUMN assets.electronics_subcategory IS 'Subcategory for electronics items (tablet, pc, other)';
