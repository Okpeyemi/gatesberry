-- ============================================================
-- Fonction: get_merchant_balance(merchant_id)
-- Solde retirable = Σ transactions approved − Σ withdrawals non-failed
-- Décompte sur fedapay_amount (brut) car le marchand paie la commission.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_merchant_balance(p_merchant_id UUID)
RETURNS INTEGER
LANGUAGE SQL STABLE AS $$
  SELECT COALESCE(
    (SELECT SUM(amount)::INT FROM public.transactions
       WHERE merchant_id = p_merchant_id AND status = 'approved'), 0
  )
  -
  COALESCE(
    (SELECT SUM(fedapay_amount)::INT FROM public.withdrawals
       WHERE merchant_id = p_merchant_id
         AND status NOT IN ('failed', 'rejected', 'cancelled')), 0
  );
$$;
