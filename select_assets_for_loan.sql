ALTER TABLE asset_loan_requests
  ADD COLUMN IF NOT EXISTS finance_selected_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS finance_selected_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION issue_asset_loan_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  loan_request asset_loan_requests%ROWTYPE;
  expected_count INTEGER;
  issued_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public_users WHERE id = actor AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can issue assets';
  END IF;

  SELECT * INTO loan_request
  FROM asset_loan_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR loan_request.status <> 'approved' THEN
    RAISE EXCEPTION 'Loan request is not approved or was already issued';
  END IF;
  IF loan_request.finance_selected_at IS NULL THEN
    RAISE EXCEPTION 'Finance must select the asset serial numbers before handover';
  END IF;

  SELECT COUNT(*) INTO expected_count
  FROM asset_loans WHERE request_id = p_request_id AND status = 'approved';
  IF expected_count = 0 THEN
    RAISE EXCEPTION 'No approved assets found for this request';
  END IF;

  UPDATE assets a
  SET borrowed_by = loan_request.requester_id,
      borrowed_at = NOW(),
      return_requested = FALSE,
      return_requested_at = NULL
  FROM asset_loans l
  WHERE l.request_id = p_request_id
    AND l.status = 'approved'
    AND a.id = l.asset_id
    AND a.borrowed_by IS NULL
    AND a.assigned_to IS NULL
    AND a.status IN ('new', 'in_use');
  GET DIAGNOSTICS issued_count = ROW_COUNT;
  IF issued_count <> expected_count THEN
    RAISE EXCEPTION 'One or more assets are no longer available; nothing was issued';
  END IF;

  UPDATE asset_loans
  SET status = 'issued', borrowed_at = NOW()
  WHERE request_id = p_request_id AND status = 'approved';

  UPDATE asset_loan_requests
  SET status = 'issued', issued_by = actor, issued_at = NOW()
  WHERE id = p_request_id;

  INSERT INTO notifications (user_id, type, title, message, link, metadata)
  VALUES (
    loan_request.requester_id,
    'asset_loan_issued',
    'Assets handed over',
    'Your approved assets have been issued to you.',
    '/worker',
    jsonb_build_object('loan_request_id', p_request_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION issue_asset_loan_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION issue_asset_loan_request(UUID) TO authenticated;
