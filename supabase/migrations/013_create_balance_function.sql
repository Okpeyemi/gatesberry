-- ============================================================
-- Fonction: get_merchant_balance(merchant_id)
-- Solde retirable = Σ transactions approved − Σ withdrawals non-failed
-- Décompte sur fedapay_amount (brut) car le marchand paie la commission.
--
-- SECURITY DEFINER + guard : un user authentifié ne peut interroger
-- que son propre solde (sauf admin). service_role (auth.uid() IS NULL)
-- a accès libre.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_merchant_balance(p_merchant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller UUID := auth.uid();
  caller_is_admin BOOLEAN := FALSE;
BEGIN
  IF caller IS NOT NULL THEN
    SELECT is_admin INTO caller_is_admin FROM profiles WHERE id = caller;
    IF caller <> p_merchant_id AND COALESCE(caller_is_admin, FALSE) = FALSE THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  END IF;

  RETURN COALESCE(
    (SELECT SUM(amount)::INT FROM transactions
       WHERE merchant_id = p_merchant_id AND status = 'approved'), 0
  )
  -
  COALESCE(
    (SELECT SUM(fedapay_amount)::INT FROM withdrawals
       WHERE merchant_id = p_merchant_id
         AND status NOT IN ('failed', 'rejected', 'cancelled')), 0
  );
END;
$$;
