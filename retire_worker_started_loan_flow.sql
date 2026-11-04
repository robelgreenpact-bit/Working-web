DO $$
DECLARE
  pending_count INTEGER;
  has_selection_marker BOOLEAN;
BEGIN
  IF to_regclass('public.asset_loan_requests') IS NULL THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'asset_loan_requests'
      AND column_name = 'finance_selected_at'
  ) INTO has_selection_marker;

  IF has_selection_marker THEN
    EXECUTE $query$
      SELECT COUNT(*)
      FROM public.asset_loan_requests
      WHERE status = 'requested'
         OR (status = 'approved' AND finance_selected_at IS NULL)
    $query$ INTO pending_count;
  ELSE
    SELECT COUNT(*) INTO pending_count
    FROM public.asset_loan_requests
    WHERE status IN ('requested', 'approved');
  END IF;

  IF pending_count > 0 THEN
    RAISE EXCEPTION
      'Found % unfinished worker-started loan request(s). Finish or cancel them before retiring the worker loan flow.',
      pending_count;
  END IF;

  EXECUTE 'DROP FUNCTION IF EXISTS public.create_asset_loan_request(UUID[], TEXT, DATE)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.decide_asset_loan_request(UUID, TEXT, TEXT)';
  EXECUTE 'DROP FUNCTION IF EXISTS public.finance_select_asset_loan_items(UUID, UUID[])';
END;
$$;
