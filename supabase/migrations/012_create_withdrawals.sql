-- ============================================================
-- Table: withdrawals
-- Demandes de retrait du solde marchand vers son mobile money
-- via l'API FedaPay payouts.
-- ============================================================

CREATE TABLE public.withdrawals (
  id                      UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Montants (XOF entiers)
  amount                  INTEGER      NOT NULL CHECK (amount >= 500),
  fedapay_amount          INTEGER,
  fee                     INTEGER,

  -- Coordonnées de versement (snapshot figé à la création)
  receiver_name           TEXT         NOT NULL,
  receiver_phone          TEXT         NOT NULL,
  receiver_country        TEXT         NOT NULL,
  receiver_provider       TEXT         NOT NULL,

  -- Workflow
  status                  TEXT         NOT NULL DEFAULT 'pending_review',
  rejection_reason        TEXT,
  failure_reason          TEXT,

  -- Liens FedaPay
  fedapay_payout_id       BIGINT       UNIQUE,
  merchant_reference      TEXT         UNIQUE,

  -- Anti-retry infini de l'auto-approve
  auto_approve_attempts   INTEGER      NOT NULL DEFAULT 0,

  -- Audit
  reviewed_by             UUID         REFERENCES auth.users(id),
  reviewed_at             TIMESTAMPTZ,
  sent_at                 TIMESTAMPTZ,

  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX withdrawals_merchant_id_idx ON public.withdrawals (merchant_id);
CREATE INDEX withdrawals_status_idx      ON public.withdrawals (status);
CREATE INDEX withdrawals_fedapay_id_idx  ON public.withdrawals (fedapay_payout_id);

-- RLS
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marchand lit ses retraits, admin lit tout"
  ON public.withdrawals FOR SELECT
  USING (auth.uid() = merchant_id
         OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Marchand crée son retrait"
  ON public.withdrawals FOR INSERT
  WITH CHECK (auth.uid() = merchant_id);

-- UPDATE interdit côté client : passe par les routes API en service_role
CREATE POLICY "No client UPDATE"
  ON public.withdrawals FOR UPDATE
  USING (FALSE);

CREATE TRIGGER withdrawals_updated_at
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
