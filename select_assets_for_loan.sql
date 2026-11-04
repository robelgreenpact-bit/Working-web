ALTER TABLE asset_loan_requests
  ADD COLUMN IF NOT EXISTS finance_selected_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS finance_selected_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION finance_select_asset_loan_items(
  p_request_id UUID,
  p_asset_ids UUID[]
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  loan_request asset_loan_requests%ROWTYPE;
  requested_count INTEGER;
  valid_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public_users
    WHERE id = actor AND role IN ('finance', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only finance or admin can select loan assets';
  END IF;

  SELECT * INTO loan_request
  FROM asset_loan_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR loan_request.status <> 'approved' THEN
    RAISE EXCEPTION 'Loan request is not awaiting finance asset selection';
  END IF;

  SELECT COUNT(*) INTO requested_count
  FROM asset_loans
  WHERE request_id = p_request_id AND status = 'approved';

  IF p_asset_ids IS NULL OR CARDINALITY(p_asset_ids) <> requested_count THEN
    RAISE EXCEPTION 'Select one asset for every requested item';
  END IF;
  IF CARDINALITY(ARRAY(SELECT DISTINCT unnest(p_asset_ids))) <> CARDINALITY(p_asset_ids) THEN
    RAISE EXCEPTION 'An asset can only be selected once per request';
  END IF;

  WITH requested_items AS (
    SELECT asset_id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS position
    FROM asset_loans
    WHERE request_id = p_request_id AND status = 'approved'
  ),
  selected_items AS (
    SELECT selected_asset_id, position
    FROM UNNEST(p_asset_ids) WITH ORDINALITY AS selected(selected_asset_id, position)
  )
  SELECT COUNT(*) INTO valid_count
  FROM requested_items requested
  JOIN selected_items selected USING (position)
  JOIN assets requested_asset ON requested_asset.id = requested.asset_id
  JOIN assets selected_asset ON selected_asset.id = selected.selected_asset_id
  WHERE selected_asset.borrowed_by IS NULL
    AND selected_asset.assigned_to IS NULL
    AND selected_asset.status IN ('new', 'in_use')
    AND selected_asset.category IS NOT DISTINCT FROM requested_asset.category
    AND selected_asset.item_name IS NOT DISTINCT FROM requested_asset.item_name
    AND NOT EXISTS (
      SELECT 1 FROM asset_loans other_loan
      WHERE other_loan.asset_id = selected_asset.id
        AND other_loan.request_id <> p_request_id
        AND other_loan.status IN ('requested', 'approved', 'issued', 'return_requested')
    );

  IF valid_count <> requested_count THEN
    RAISE EXCEPTION 'Selected assets must match the requested items and still be available';
  END IF;

  DELETE FROM asset_loans
  WHERE request_id = p_request_id AND status = 'approved';

  INSERT INTO asset_loans (request_id, asset_id, borrower_id, due_date, status)
  SELECT p_request_id, selected_asset_id, loan_request.requester_id, loan_request.due_date, 'approved'
  FROM UNNEST(p_asset_ids) AS selected(selected_asset_id);

  UPDATE asset_loan_requests
  SET finance_selected_by = actor, finance_selected_at = NOW()
  WHERE id = p_request_id;
END;
$$;

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

REVOKE ALL ON FUNCTION finance_select_asset_loan_items(UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance_select_asset_loan_items(UUID, UUID[]) TO authenticated;
REVOKE ALL ON FUNCTION issue_asset_loan_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION issue_asset_loan_request(UUID) TO authenticated;
