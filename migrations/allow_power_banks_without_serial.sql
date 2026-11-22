ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_electronics_serial_required;

ALTER TABLE assets
  ADD CONSTRAINT assets_electronics_serial_required
  CHECK (
    category IS DISTINCT FROM 'electronics'
    OR electronics_subcategory IS NOT DISTINCT FROM 'power_bank'
    OR NULLIF(BTRIM(serial_number), '') IS NOT NULL
  ) NOT VALID;
