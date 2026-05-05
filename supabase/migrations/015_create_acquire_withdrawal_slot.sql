-- ============================================================
-- Fonction: acquire_withdrawal_slot(merchant_id, fedapay_amount)
-- Lock advisory par marchand + check 1/jour + check solde, atomique.
-- Doit être appelée juste avant l'INSERT du retrait.
--
-- Renvoie : 'ok' | 'duplicate' | 'insufficient'
-- 'ok'           = créneau réservé, on peut INSERT
-- 'duplicate'    = retrait déjà existant aujourd'hui (non-terminal)
-- 'insufficient' = solde < fedapay_amount
--
-- Le lock advisory dure jusqu'à la fin de la transaction Postgres.
-- service_role context (auth.uid IS NULL) → pas de restriction.
-- ============================================================

CREATE OR REPLACE FUNCTION public.acquire_withdrawal_slot(
  p_merchant_id    UUID,
  p_fedapay_amount INTEGER
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today_count INTEGER;
  bal         INTEGER;
BEGIN
  -- Lock advisory exclusif par marchand pour la durée de la transaction.
  -- Évite que 2 requêtes concurrentes du même marchand passent le check ensemble.
  PERFORM pg_advisory_xact_lock(hashtext(p_merchant_id::text));

  SELECT COUNT(*) INTO today_count
    FROM withdrawals
   WHERE merchant_id = p_merchant_id
     AND created_at >= CURRENT_DATE
     AND status NOT IN ('failed', 'rejected', 'cancelled');
  IF today_count >= 1 THEN
    RETURN 'duplicate';
  END IF;

  bal := public.get_merchant_balance(p_merchant_id);
  IF bal < p_fedapay_amount THEN
    RETURN 'insufficient';
  END IF;

  RETURN 'ok';
END;
$$;
