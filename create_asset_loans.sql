CREATE TABLE IF NOT EXISTS asset_loan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'issued', 'return_requested', 'returned')),
  manager_id UUID REFERENCES auth.users(id),
  manager_decision_at TIMESTAMPTZ,
  manager_comment TEXT,
  issued_by UUID REFERENCES auth.users(id),
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES asset_loan_requests(id) ON DELETE RESTRICT,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  borrower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'issued', 'return_requested', 'returned')),
  borrowed_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  return_condition TEXT CHECK (return_condition IN ('good', 'damaged', 'lost')),
  return_note TEXT,
  return_requested_at TIMESTAMPTZ,
  return_confirmed_by UUID REFERENCES auth.users(id),
  return_confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS asset_loan_requests_requester_idx
  ON asset_loan_requests (requester_id, created_at DESC);
CREATE INDEX IF NOT EXISTS asset_loan_requests_status_idx
  ON asset_loan_requests (status, created_at);
CREATE INDEX IF NOT EXISTS asset_loans_asset_idx
  ON asset_loans (asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS asset_loans_borrower_idx
  ON asset_loans (borrower_id, status, due_date);
CREATE UNIQUE INDEX IF NOT EXISTS asset_loans_one_open_request_per_asset
  ON asset_loans (asset_id)
  WHERE status IN ('requested', 'approved', 'issued', 'return_requested');

DO $$
DECLARE
  legacy_asset RECORD;
  legacy_request_id UUID;
BEGIN
  FOR legacy_asset IN
    SELECT id, borrowed_by, borrowed_at, return_requested, return_requested_at
    FROM assets
    WHERE borrowed_by IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM asset_loans
        WHERE asset_loans.asset_id = assets.id
          AND asset_loans.status IN ('requested', 'approved', 'issued', 'return_requested')
      )
  LOOP
    INSERT INTO asset_loan_requests (
      requester_id,
      purpose,
      due_date,
      status,
      issued_at,
      created_at
    )
    VALUES (
      legacy_asset.borrowed_by,
      'Existing loan imported during migration',
      NULL,
      CASE WHEN legacy_asset.return_requested THEN 'return_requested' ELSE 'issued' END,
      legacy_asset.borrowed_at,
      COALESCE(legacy_asset.borrowed_at, NOW())
    )
    RETURNING id INTO legacy_request_id;

    INSERT INTO asset_loans (
      request_id,
      asset_id,
      borrower_id,
      due_date,
      status,
      borrowed_at,
      return_requested_at,
      created_at
    )
    VALUES (
      legacy_request_id,
      legacy_asset.id,
      legacy_asset.borrowed_by,
      NULL,
      CASE WHEN legacy_asset.return_requested THEN 'return_requested' ELSE 'issued' END,
      legacy_asset.borrowed_at,
      legacy_asset.return_requested_at,
      COALESCE(legacy_asset.borrowed_at, NOW())
    );
  END LOOP;
END;
$$;

ALTER TABLE asset_loan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY asset_loan_requests_read_access ON asset_loan_requests
  FOR SELECT TO authenticated
  USING (
    requester_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public_users
      WHERE public_users.id = auth.uid()
        AND public_users.role IN ('admin', 'manager', 'finance')
    )
  );

CREATE POLICY asset_loans_read_access ON asset_loans
  FOR SELECT TO authenticated
  USING (
    borrower_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public_users
      WHERE public_users.id = auth.uid()
        AND public_users.role IN ('admin', 'manager', 'finance')
    )
  );

CREATE OR REPLACE FUNCTION create_asset_loan_request(
  p_asset_ids UUID[],
  p_purpose TEXT,
  p_due_date DATE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requester UUID := auth.uid();
  new_request_id UUID;
  available_count INTEGER;
BEGIN
  IF requester IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF COALESCE(BTRIM(p_purpose), '') = '' THEN
    RAISE EXCEPTION 'Purpose is required';
  END IF;
  IF p_due_date IS NULL OR p_due_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'A due date today or later is required';
  END IF;
  IF p_asset_ids IS NULL OR CARDINALITY(p_asset_ids) = 0 THEN
    RAISE EXCEPTION 'Select at least one asset';
  END IF;
  IF CARDINALITY(ARRAY(SELECT DISTINCT unnest(p_asset_ids))) <> CARDINALITY(p_asset_ids) THEN
    RAISE EXCEPTION 'Duplicate assets are not allowed';
  END IF;

  SELECT COUNT(*) INTO available_count
  FROM assets
  WHERE id = ANY(p_asset_ids)
    AND borrowed_by IS NULL
    AND assigned_to IS NULL
    AND status IN ('new', 'in_use');

  IF available_count <> CARDINALITY(p_asset_ids) THEN
    RAISE EXCEPTION 'One or more selected assets are no longer available';
  END IF;

  INSERT INTO asset_loan_requests (requester_id, purpose, due_date)
  VALUES (requester, BTRIM(p_purpose), p_due_date)
  RETURNING id INTO new_request_id;

  INSERT INTO asset_loans (request_id, asset_id, borrower_id, due_date)
  SELECT new_request_id, selected_asset_id, requester, p_due_date
  FROM UNNEST(p_asset_ids) AS selected_asset(selected_asset_id);

  RETURN new_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION decide_asset_loan_request(
  p_request_id UUID,
  p_decision TEXT,
  p_comment TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  loan_request asset_loan_requests%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public_users
    WHERE id = actor AND role = 'manager'
  ) THEN
    RAISE EXCEPTION 'Only managers can decide loan requests';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  SELECT * INTO loan_request
  FROM asset_loan_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR loan_request.status <> 'requested' THEN
    RAISE EXCEPTION 'Loan request is no longer awaiting approval';
  END IF;

  UPDATE asset_loan_requests
  SET status = p_decision,
      manager_id = actor,
      manager_decision_at = NOW(),
      manager_comment = NULLIF(BTRIM(p_comment), '')
  WHERE id = p_request_id;

  UPDATE asset_loans SET status = p_decision WHERE request_id = p_request_id;

  IF p_decision = 'approved' THEN
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    VALUES (
      loan_request.requester_id,
      'asset_loan_approved',
      'Borrow request approved',
      'Your borrow request was approved and is awaiting handover.',
      '/worker',
      jsonb_build_object('loan_request_id', p_request_id)
    );
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    SELECT id,
           'asset_loan_handover_pending',
           'Approved assets need handover',
           'A borrow request was approved and is awaiting asset handover.',
           '/assets',
           jsonb_build_object('loan_request_id', p_request_id)
    FROM public_users
    WHERE role = 'admin';
  ELSE
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    VALUES (
      loan_request.requester_id,
      'asset_loan_rejected',
      'Borrow request rejected',
      'Your borrow request was rejected.',
      '/worker',
      jsonb_build_object('loan_request_id', p_request_id)
    );
  END IF;
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

CREATE OR REPLACE FUNCTION request_asset_loan_return(
  p_loan_id UUID,
  p_return_condition TEXT,
  p_note TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  loan asset_loans%ROWTYPE;
BEGIN
  IF p_return_condition NOT IN ('good', 'damaged', 'lost') THEN
    RAISE EXCEPTION 'Select a return condition';
  END IF;

  SELECT * INTO loan FROM asset_loans WHERE id = p_loan_id FOR UPDATE;
  IF NOT FOUND OR loan.borrower_id <> actor OR loan.status <> 'issued' THEN
    RAISE EXCEPTION 'This loan cannot be returned by this user';
  END IF;

  UPDATE asset_loans
  SET status = 'return_requested',
      return_condition = p_return_condition,
      return_note = NULLIF(BTRIM(p_note), ''),
      return_requested_at = NOW()
  WHERE id = p_loan_id;

  UPDATE assets
  SET return_requested = TRUE, return_requested_at = NOW()
  WHERE id = loan.asset_id AND borrowed_by = actor;

  UPDATE asset_loan_requests SET status = 'return_requested' WHERE id = loan.request_id;

  INSERT INTO notifications (user_id, type, title, message, link, metadata)
  SELECT id,
         'asset_return_requested',
         'Asset return requested',
         'A borrower has requested return confirmation.',
         '/assets',
         jsonb_build_object('loan_request_id', loan.request_id, 'loan_id', loan.id)
  FROM public_users
  WHERE role = 'admin';
END;
$$;

CREATE OR REPLACE FUNCTION confirm_asset_loan_return(
  p_loan_id UUID,
  p_return_condition TEXT,
  p_note TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  loan asset_loans%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public_users WHERE id = actor AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can confirm asset returns';
  END IF;
  IF p_return_condition NOT IN ('good', 'damaged', 'lost') THEN
    RAISE EXCEPTION 'Invalid return condition';
  END IF;

  SELECT * INTO loan FROM asset_loans WHERE id = p_loan_id FOR UPDATE;
  IF NOT FOUND OR loan.status <> 'return_requested' THEN
    RAISE EXCEPTION 'Return is no longer pending confirmation';
  END IF;

  UPDATE assets
  SET borrowed_by = NULL,
      borrowed_at = NULL,
      return_requested = FALSE,
      return_requested_at = NULL,
      status = CASE
        WHEN p_return_condition = 'damaged' THEN 'under_repair'
        WHEN p_return_condition = 'lost' THEN 'retired'
        ELSE status
      END
  WHERE id = loan.asset_id AND borrowed_by = loan.borrower_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asset holder no longer matches this loan';
  END IF;

  UPDATE asset_loans
  SET status = 'returned',
      returned_at = NOW(),
      return_condition = p_return_condition,
      return_note = COALESCE(NULLIF(BTRIM(p_note), ''), return_note),
      return_confirmed_by = actor,
      return_confirmed_at = NOW()
  WHERE id = p_loan_id;

  IF NOT EXISTS (
    SELECT 1 FROM asset_loans
    WHERE request_id = loan.request_id AND status <> 'returned'
  ) THEN
    UPDATE asset_loan_requests SET status = 'returned' WHERE id = loan.request_id;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, link, metadata)
  VALUES (
    loan.borrower_id,
    'asset_return_confirmed',
    'Asset return confirmed',
    'Your asset return was confirmed.',
    '/worker',
    jsonb_build_object('loan_request_id', loan.request_id, 'loan_id', loan.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION create_asset_loan_request(UUID[], TEXT, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION decide_asset_loan_request(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION issue_asset_loan_request(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION request_asset_loan_return(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION confirm_asset_loan_return(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_asset_loan_request(UUID[], TEXT, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION decide_asset_loan_request(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION issue_asset_loan_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION request_asset_loan_return(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION confirm_asset_loan_return(UUID, TEXT, TEXT) TO authenticated;
