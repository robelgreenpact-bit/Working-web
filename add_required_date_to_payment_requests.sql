-- Add required_date column to payment_requests table
-- Run this in your Supabase SQL editor

ALTER TABLE payment_requests 
ADD COLUMN required_date DATE;

-- Add comment to document the purpose
COMMENT ON COLUMN payment_requests.required_date IS 'The date by which the payment request items are required';
