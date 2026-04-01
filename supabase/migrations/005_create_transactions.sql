-- ============================================================
-- Table: transactions
-- Enregistre les paiements effectués par les clients finaux
-- via FedaPay sur les pages de paiement des marchands.
-- ============================================================

CREATE TABLE public.transactions (
  id                     UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_page_id        UUID        NOT NULL REFERENCES public.payment_pages(id) ON DELETE CASCADE,
  product_id             UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  merchant_id            UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fedapay_transaction_id BIGINT,
  merchant_reference     TEXT        UNIQUE,
  amount                 INTEGER     NOT NULL CHECK (amount >= 0),
  status                 TEXT        NOT NULL DEFAULT 'pending',
  customer_phone         TEXT        NOT NULL,
  auto_renew             BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX transactions_merchant_id_idx    ON public.transactions (merchant_id);
CREATE INDEX transactions_payment_page_idx   ON public.transactions (payment_page_id);
CREATE INDEX transactions_status_idx         ON public.transactions (status);
CREATE INDEX transactions_fedapay_id_idx     ON public.transactions (fedapay_transaction_id);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Le marchand peut voir ses propres transactions
CREATE POLICY "Lecture transactions personnelles"
  ON public.transactions FOR SELECT
  USING (auth.uid() = merchant_id);

-- Insertion publique (le client final n'est pas authentifié)
CREATE POLICY "Insertion transaction publique"
  ON public.transactions FOR INSERT
  WITH CHECK (TRUE);

-- Mise à jour par le service (via service_role key ou le marchand)
CREATE POLICY "Mise a jour transaction"
  ON public.transactions FOR UPDATE
  USING (TRUE);

-- ── Trigger updated_at ──────────────────────────────────────
CREATE TRIGGER transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
