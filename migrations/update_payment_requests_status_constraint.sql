-- Update the check constraint to include 'pending_finance' as a valid status
-- First, drop the existing constraint
ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS payment_requests_status_check;

-- Then recreate it with the updated list including 'pending_finance'
ALTER TABLE payment_requests 
ADD CONSTRAINT payment_requests_status_check 
CHECK (status IN ('pending_manager', 'pending_finance', 'approved', 'rejected', 'paid'));
