-- Update the check constraint to include 'electronics' as a valid type
-- First, drop the existing constraint
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_type_check;

-- Then recreate it with the updated list including 'electronics'
ALTER TABLE requests 
ADD CONSTRAINT requests_type_check 
CHECK (type IN ('physical_good', 'electronics', 'travel_expense', 'reimbursement', 'other_asset', 'document_request'));
