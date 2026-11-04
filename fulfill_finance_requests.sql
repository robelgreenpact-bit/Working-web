ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS fulfillment_status TEXT NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN IF NOT EXISTS purchase_quantity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fulfillment_mode TEXT NOT NULL DEFAULT 'assign',
  ADD COLUMN IF NOT EXISTS fulfillment_due_date DATE;

ALTER TABLE requests
  DROP CONSTRAINT IF EXISTS requests_fulfillment_status_check;
ALTER TABLE requests
  ADD CONSTRAINT requests_fulfillment_status_check
  CHECK (fulfillment_status IN ('not_applicable', 'awaiting_purchase', 'partially_fulfilled', 'fulfilled'));

ALTER TABLE requests
  DROP CONSTRAINT IF EXISTS requests_fulfillment_mode_check;
ALTER TABLE requests
  ADD CONSTRAINT requests_fulfillment_mode_check
  CHECK (fulfillment_mode IN ('assign', 'lend'));

DO $$
BEGIN
  IF EXISTS (
    SELECT LOWER(BTRIM(serial_number))
    FROM assets
    WHERE serial_number IS NOT NULL AND BTRIM(serial_number) <> ''
    GROUP BY LOWER(BTRIM(serial_number))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate serial numbers exist; resolve them before adding the unique serial index';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS assets_serial_number_unique
  ON assets (LOWER(BTRIM(serial_number)))
  WHERE serial_number IS NOT NULL AND BTRIM(serial_number) <> '';

ALTER TABLE assets
  DROP CONSTRAINT IF EXISTS assets_electronics_serial_required;
ALTER TABLE assets
  ADD CONSTRAINT assets_electronics_serial_required
  CHECK (
    category IS DISTINCT FROM 'electronics'
    OR NULLIF(BTRIM(serial_number), '') IS NOT NULL
  ) NOT VALID;

CREATE TABLE IF NOT EXISTS request_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  fulfillment_mode TEXT NOT NULL CHECK (fulfillment_mode IN ('assign', 'lend')),
  source TEXT NOT NULL DEFAULT 'inventory' CHECK (source IN ('inventory', 'purchase')),
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_date DATE,
  loan_id UUID REFERENCES asset_loans(id) ON DELETE RESTRICT,
  UNIQUE (request_id, asset_id)
);

CREATE INDEX IF NOT EXISTS request_assets_request_idx ON request_assets (request_id);
CREATE INDEX IF NOT EXISTS request_assets_asset_idx ON request_assets (asset_id);
ALTER TABLE request_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS request_assets_read_access ON request_assets;
CREATE POLICY request_assets_read_access ON request_assets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM requests
      WHERE requests.id = request_assets.request_id
        AND requests.requester_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public_users
      WHERE public_users.id = auth.uid()
        AND public_users.role IN ('admin', 'manager', 'finance')
    )
  );

CREATE OR REPLACE FUNCTION decide_finance_request_fulfillment(
  p_request_id UUID,
  p_decision TEXT,
  p_comment TEXT DEFAULT NULL,
  p_for_tax_registry BOOLEAN DEFAULT FALSE,
  p_asset_ids UUID[] DEFAULT ARRAY[]::UUID[],
  p_fulfillment_mode TEXT DEFAULT 'assign',
  p_purchase_quantity INTEGER DEFAULT 0,
  p_due_date DATE DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  request_row requests%ROWTYPE;
  required_count INTEGER;
  selected_count INTEGER;
  available_count INTEGER;
  assigned_count INTEGER;
  loan_request_id UUID;
  manager_id UUID;
  item_list TEXT;
  next_fulfillment_status TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public_users
    WHERE id = actor AND role IN ('finance', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only finance or admin can decide requests';
  END IF;
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;

  SELECT * INTO request_row FROM requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR request_row.status <> 'pending_finance' THEN
    RAISE EXCEPTION 'Request is no longer waiting for finance; refresh the list';
  END IF;

  IF p_decision = 'rejected' THEN
    UPDATE requests SET status = 'rejected', fulfillment_status = 'not_applicable'
    WHERE id = p_request_id;
    INSERT INTO approvals (request_id, approver_id, role_at_time, decision, comment)
    VALUES (p_request_id, actor, 'finance', 'rejected', NULLIF(BTRIM(p_comment), ''));
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    VALUES (
      request_row.requester_id,
      'request_rejected',
      'Request Rejected',
      format('Your request "%s" was rejected by finance.', request_row.title),
      '/worker',
      jsonb_build_object('request_id', p_request_id)
    );
    RETURN;
  END IF;

  IF request_row.type IN ('electronics', 'physical_good', 'other_asset') THEN
    required_count := GREATEST(COALESCE(request_row.quantity, 1), 1);
    selected_count := COALESCE(CARDINALITY(p_asset_ids), 0);
    IF p_purchase_quantity IS NULL OR p_purchase_quantity < 0
      OR selected_count + p_purchase_quantity <> required_count THEN
      RAISE EXCEPTION 'Assign an inventory unit or mark as needs purchase for each requested item';
    END IF;
    IF p_fulfillment_mode NOT IN ('assign', 'lend') THEN
      RAISE EXCEPTION 'Choose Assign or Lend for the requested units';
    END IF;
    IF p_fulfillment_mode = 'lend' AND required_count > 0
      AND (p_due_date IS NULL OR p_due_date < CURRENT_DATE) THEN
      RAISE EXCEPTION 'Choose a return date today or later for lent units';
    END IF;
    IF CARDINALITY(ARRAY(SELECT DISTINCT UNNEST(COALESCE(p_asset_ids, ARRAY[]::UUID[])))) <> selected_count THEN
      RAISE EXCEPTION 'An asset can only be selected once per request';
    END IF;

    IF selected_count > 0 THEN
      PERFORM id FROM assets
      WHERE id = ANY(p_asset_ids)
      ORDER BY id
      FOR UPDATE;

      SELECT COUNT(*) INTO available_count
      FROM assets selected_asset
      WHERE selected_asset.id = ANY(p_asset_ids)
        AND selected_asset.borrowed_by IS NULL
        AND selected_asset.assigned_to IS NULL
        AND selected_asset.status IN ('new', 'in_use')
        AND selected_asset.category IS NOT DISTINCT FROM COALESCE(request_row.asset_category, CASE WHEN request_row.type = 'electronics' THEN 'electronics' ELSE 'other' END)
        AND (
          request_row.item_name IS NULL
          OR request_row.item_name = request_row.title
          OR selected_asset.item_name IS NOT DISTINCT FROM request_row.item_name
        )
        AND (
          request_row.type <> 'electronics'
          OR (
            (
              selected_asset.electronics_subcategory IS NOT DISTINCT FROM request_row.electronics_subcategory
              OR request_row.electronics_subcategory IS NULL
            )
            AND NULLIF(BTRIM(selected_asset.serial_number), '') IS NOT NULL
          )
        )
        AND NOT EXISTS (
          SELECT 1 FROM asset_loans active_loan
          WHERE active_loan.asset_id = selected_asset.id
            AND active_loan.status IN ('requested', 'approved', 'issued', 'return_requested')
        );
      IF available_count <> selected_count THEN
        RAISE EXCEPTION 'One or more selected units no longer match or are unavailable; refresh the list';
      END IF;
    END IF;

    IF p_fulfillment_mode = 'lend' AND selected_count > 0 THEN
      SELECT approver_id INTO manager_id FROM approvals
      WHERE request_id = p_request_id AND role_at_time = 'manager' AND decision = 'approved'
      ORDER BY created_at DESC LIMIT 1;

      INSERT INTO asset_loan_requests (
        requester_id, purpose, due_date, status, manager_id, manager_decision_at,
        finance_selected_by, finance_selected_at
      ) VALUES (
        request_row.requester_id,
        COALESCE(NULLIF(BTRIM(request_row.justification), ''), request_row.title),
        p_due_date,
        'approved',
        manager_id,
        NOW(),
        actor,
        NOW()
      ) RETURNING id INTO loan_request_id;

      WITH created_loans AS (
        INSERT INTO asset_loans (request_id, asset_id, borrower_id, due_date, status)
        SELECT loan_request_id, selected_asset.id, request_row.requester_id, p_due_date, 'approved'
        FROM assets selected_asset
        WHERE selected_asset.id = ANY(p_asset_ids)
        RETURNING id, asset_id
      )
      INSERT INTO request_assets (request_id, asset_id, fulfillment_mode, source, assigned_by, due_date, loan_id)
      SELECT p_request_id, asset_id, 'lend', 'inventory', actor, p_due_date, id
      FROM created_loans;

            INSERT INTO notifications (user_id, type, title, message, link, metadata)
            SELECT id,
              'asset_loan_handover_pending',
              'Approved assets need handover',
              'A finance-approved request has lent inventory and is awaiting physical handover.',
              '/assets',
              jsonb_build_object('loan_request_id', loan_request_id, 'request_id', p_request_id)
            FROM public_users
            WHERE role = 'admin';
    ELSIF selected_count > 0 THEN
      UPDATE assets SET assigned_to = request_row.requester_id, status = 'in_use'
      WHERE id = ANY(p_asset_ids)
        AND borrowed_by IS NULL
        AND assigned_to IS NULL
        AND status IN ('new', 'in_use');
      GET DIAGNOSTICS assigned_count = ROW_COUNT;
      IF assigned_count <> selected_count THEN
        RAISE EXCEPTION 'One or more selected units were just assigned; refresh the list';
      END IF;
      INSERT INTO request_assets (request_id, asset_id, fulfillment_mode, source, assigned_by)
      SELECT p_request_id, asset_id, 'assign', 'inventory', actor
      FROM assets WHERE id = ANY(p_asset_ids);
    END IF;

    next_fulfillment_status := CASE
      WHEN p_purchase_quantity = 0 THEN 'fulfilled'
      WHEN selected_count > 0 THEN 'partially_fulfilled'
      ELSE 'awaiting_purchase'
    END;
    UPDATE requests
    SET status = 'approved',
        fulfillment_status = next_fulfillment_status,
        purchase_quantity = p_purchase_quantity,
        fulfillment_mode = p_fulfillment_mode,
        fulfillment_due_date = CASE WHEN p_fulfillment_mode = 'lend' THEN p_due_date ELSE NULL END,
        for_tax_registry = COALESCE(p_for_tax_registry, FALSE)
    WHERE id = p_request_id;
  ELSE
    UPDATE requests
    SET status = 'approved',
        fulfillment_status = 'not_applicable',
        for_tax_registry = COALESCE(p_for_tax_registry, FALSE)
    WHERE id = p_request_id;
  END IF;

  INSERT INTO approvals (request_id, approver_id, role_at_time, decision, comment)
  VALUES (p_request_id, actor, 'finance', 'approved', NULLIF(BTRIM(p_comment), ''));

  SELECT STRING_AGG(
    COALESCE(asset.item_name, request_row.item_name, request_row.title) || ' ' || asset.asset_tag ||
    CASE WHEN NULLIF(BTRIM(asset.serial_number), '') IS NOT NULL THEN ' (SN ' || asset.serial_number || ')' ELSE '' END,
    ', ' ORDER BY asset.asset_tag
  ) INTO item_list
  FROM request_assets link JOIN assets asset ON asset.id = link.asset_id
  WHERE link.request_id = p_request_id;

  INSERT INTO notifications (user_id, type, title, message, link, metadata)
  VALUES (
    request_row.requester_id,
    'request_finally_approved',
    'Request Approved',
    CASE
      WHEN next_fulfillment_status = 'awaiting_purchase'
        THEN format('Your request "%s" was approved and is awaiting purchase.', request_row.title)
      WHEN next_fulfillment_status = 'partially_fulfilled'
        THEN format('Your request "%s" was partially fulfilled. %s: %s. Remaining units are awaiting purchase.', request_row.title, CASE WHEN p_fulfillment_mode = 'lend' THEN 'Lent' ELSE 'Assigned' END, COALESCE(item_list, ''))
      WHEN request_row.type IN ('electronics', 'physical_good', 'other_asset') AND selected_count > 0 AND p_fulfillment_mode = 'lend'
        THEN format('Units for "%s" were lent to you: %s', request_row.title, COALESCE(item_list, ''))
      WHEN request_row.type IN ('electronics', 'physical_good', 'other_asset')
        THEN format('Units assigned for "%s": %s', request_row.title, COALESCE(item_list, ''))
      ELSE format('Your request "%s" has been fully approved and processed.', request_row.title)
    END,
    '/worker',
    jsonb_build_object('request_id', p_request_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION register_request_asset_arrivals(
  p_request_id UUID,
  p_serial_numbers TEXT[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  request_row requests%ROWTYPE;
  existing_purchase_count INTEGER;
  new_count INTEGER;
  total_assigned_count INTEGER;
  manager_id UUID;
  new_loan_request_id UUID;
  new_loan_id UUID;
  asset_category TEXT;
  prefix TEXT;
  input_serial TEXT;
  generated_asset_tag TEXT;
  next_number INTEGER;
  new_asset_id UUID;
  created_assets JSONB := '[]'::JSONB;
  item_list TEXT;
  new_fulfillment_status TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public_users WHERE id = actor AND role IN ('finance', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only finance or admin can register purchased assets';
  END IF;

  SELECT * INTO request_row FROM requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR request_row.status <> 'approved'
    OR request_row.fulfillment_status NOT IN ('awaiting_purchase', 'partially_fulfilled') THEN
    RAISE EXCEPTION 'This request is not awaiting purchased units';
  END IF;
  IF request_row.type = 'electronics' AND request_row.electronics_subcategory IS NULL THEN
    RAISE EXCEPTION 'Electronics type is required before registering units';
  END IF;
  IF p_serial_numbers IS NULL OR CARDINALITY(p_serial_numbers) = 0 THEN
    RAISE EXCEPTION 'Enter at least one serial number';
  END IF;

  SELECT COUNT(*) INTO existing_purchase_count FROM request_assets
  WHERE request_id = p_request_id AND source = 'purchase';
  SELECT COUNT(*) INTO total_assigned_count FROM request_assets
  WHERE request_id = p_request_id;
  new_count := CARDINALITY(p_serial_numbers);
  IF existing_purchase_count + new_count > COALESCE(request_row.purchase_quantity, 0)
    OR total_assigned_count + new_count > GREATEST(COALESCE(request_row.quantity, 1), 1) THEN
    RAISE EXCEPTION 'More units were entered than remain on this purchase request';
  END IF;
  IF EXISTS (
    SELECT 1 FROM UNNEST(p_serial_numbers) AS incoming(value)
    WHERE NULLIF(BTRIM(value), '') IS NULL
  ) OR CARDINALITY(ARRAY(SELECT DISTINCT LOWER(BTRIM(value)) FROM UNNEST(p_serial_numbers) AS incoming(value))) <> new_count THEN
    RAISE EXCEPTION 'Every unit needs a unique serial number';
  END IF;

  asset_category := COALESCE(request_row.asset_category, CASE WHEN request_row.type = 'electronics' THEN 'electronics' ELSE 'other' END);
  prefix := CASE asset_category
    WHEN 'electronics' THEN 'GPEL'
    WHEN 'furniture' THEN 'GPFU'
    WHEN 'vehicle' THEN 'GPVE'
    WHEN 'office_supplies' THEN 'GPOF'
    ELSE 'GPOT'
  END;

  IF request_row.fulfillment_mode = 'lend' THEN
    SELECT approver_id INTO manager_id FROM approvals
    WHERE request_id = p_request_id AND role_at_time = 'manager' AND decision = 'approved'
    ORDER BY created_at DESC LIMIT 1;

    INSERT INTO asset_loan_requests (
      requester_id, purpose, due_date, status, manager_id, manager_decision_at,
      finance_selected_by, finance_selected_at
    ) VALUES (
      request_row.requester_id,
      COALESCE(NULLIF(BTRIM(request_row.justification), ''), request_row.title),
      request_row.fulfillment_due_date,
      'approved',
      manager_id,
      NOW(),
      actor,
      NOW()
    ) RETURNING id INTO new_loan_request_id;
  END IF;

  FOREACH input_serial IN ARRAY p_serial_numbers LOOP
    input_serial := BTRIM(input_serial);
    IF EXISTS (SELECT 1 FROM assets existing WHERE LOWER(BTRIM(existing.serial_number)) = LOWER(input_serial)) THEN
      RAISE EXCEPTION 'Serial number % already exists; refresh and verify the unit', input_serial;
    END IF;

    LOOP
      INSERT INTO asset_tag_sequence (category, last_number)
      VALUES (asset_category, 1)
      ON CONFLICT (category) DO UPDATE
        SET last_number = asset_tag_sequence.last_number + 1
      RETURNING last_number INTO next_number;
      generated_asset_tag := prefix || LPAD(next_number::TEXT, 4, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM assets existing WHERE existing.asset_tag = generated_asset_tag);
    END LOOP;

    INSERT INTO assets (
      request_id, asset_tag, category, item_name, electronics_subcategory,
      serial_number, assigned_to, purchase_date, status, quantity
    ) VALUES (
      p_request_id, generated_asset_tag, asset_category,
      COALESCE(NULLIF(request_row.item_name, ''), request_row.title),
      request_row.electronics_subcategory, input_serial,
      CASE WHEN request_row.fulfillment_mode = 'assign' THEN request_row.requester_id ELSE NULL END,
      CURRENT_DATE, 'in_use', 1
    ) RETURNING id INTO new_asset_id;

    IF request_row.fulfillment_mode = 'lend' THEN
      INSERT INTO asset_loans (request_id, asset_id, borrower_id, due_date, status)
      VALUES (
        new_loan_request_id,
        new_asset_id,
        request_row.requester_id,
        request_row.fulfillment_due_date,
        'approved'
      ) RETURNING id INTO new_loan_id;
    ELSE
      new_loan_id := NULL;
    END IF;

    INSERT INTO request_assets (request_id, asset_id, fulfillment_mode, source, assigned_by, due_date, loan_id)
    VALUES (
      p_request_id,
      new_asset_id,
      request_row.fulfillment_mode,
      'purchase',
      actor,
      CASE WHEN request_row.fulfillment_mode = 'lend' THEN request_row.fulfillment_due_date ELSE NULL END,
      new_loan_id
    );
    created_assets := created_assets || jsonb_build_array(
      jsonb_build_object('id', new_asset_id, 'asset_tag', generated_asset_tag, 'serial_number', input_serial)
    );
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM assets
    WHERE request_id = p_request_id AND category = 'electronics'
      AND NULLIF(BTRIM(serial_number), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Electronics cannot be registered without serial numbers';
  END IF;

  SELECT STRING_AGG(asset_tag || ' (SN ' || serial_number || ')', ', ' ORDER BY asset_tag)
  INTO item_list
  FROM jsonb_to_recordset(created_assets) AS units(asset_tag TEXT, serial_number TEXT);

  SELECT CASE
    WHEN COUNT(*) >= GREATEST(COALESCE(request_row.quantity, 1), 1) THEN 'fulfilled'
    WHEN COUNT(*) > 0 THEN 'partially_fulfilled'
    ELSE 'awaiting_purchase'
  END INTO new_fulfillment_status
  FROM request_assets WHERE request_id = p_request_id;

  UPDATE requests SET fulfillment_status = new_fulfillment_status WHERE id = p_request_id;
  INSERT INTO notifications (user_id, type, title, message, link, metadata)
  VALUES (
    request_row.requester_id,
    'request_assets_received',
    'Purchased assets assigned',
    format('Units received for "%s" and %s to you: %s', request_row.title, CASE WHEN request_row.fulfillment_mode = 'lend' THEN 'lent' ELSE 'assigned' END, COALESCE(item_list, '')),
    '/worker',
    jsonb_build_object('request_id', p_request_id)
  );

  IF request_row.fulfillment_mode = 'lend' THEN
    INSERT INTO notifications (user_id, type, title, message, link, metadata)
    SELECT id,
           'asset_loan_handover_pending',
           'Purchased loan units need handover',
           'Newly arrived purchased units are awaiting handover.',
           '/assets',
           jsonb_build_object('loan_request_id', new_loan_request_id, 'request_id', p_request_id)
    FROM public_users
    WHERE role = 'admin';
  END IF;

  RETURN created_assets;
END;
$$;

REVOKE ALL ON FUNCTION decide_finance_request_fulfillment(UUID, TEXT, TEXT, BOOLEAN, UUID[], TEXT, INTEGER, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decide_finance_request_fulfillment(UUID, TEXT, TEXT, BOOLEAN, UUID[], TEXT, INTEGER, DATE) TO authenticated;
REVOKE ALL ON FUNCTION register_request_asset_arrivals(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_request_asset_arrivals(UUID, TEXT[]) TO authenticated;
