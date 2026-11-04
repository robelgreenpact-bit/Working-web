ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS asset_category TEXT,
  ADD COLUMN IF NOT EXISTS item_name TEXT,
  ADD COLUMN IF NOT EXISTS electronics_subcategory TEXT;
