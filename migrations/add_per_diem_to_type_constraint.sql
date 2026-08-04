-- Update the requests type check constraint to include 'per_diem'
-- First, drop the existing constraint
ALTER TABLE requests DROP CONSTRAINT IF EXISTS requests_type_check;

-- Then recreate it with the updated list including 'per_diem'
ALTER TABLE requests
ADD CONSTRAINT requests_type_check
CHECK (type IN ('physical_good', 'electronics', 'travel_expense', 'reimbursement', 'other_asset', 'document_request', 'per_diem'));
