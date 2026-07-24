-- Add for_tax_registry column to payment_requests table
-- Run this in your Supabase SQL editor

ALTER TABLE payment_requests 
ADD COLUMN for_tax_registry BOOLEAN DEFAULT FALSE;

-- Add comment to document the purpose
COMMENT ON COLUMN payment_requests.for_tax_registry IS 'Flag to indicate if a paid payment request should be sent to tax registry for registration';
