-- Table pour stocker les métadonnées des reçus
CREATE TABLE public.receipts (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID    NOT NULL UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  merchant_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path   TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX receipts_transaction_id_idx ON public.receipts (transaction_id);
CREATE INDEX receipts_merchant_id_idx    ON public.receipts (merchant_id);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;

-- Le marchand peut voir ses propres reçus
CREATE POLICY "Lecture reçus personnels"
  ON public.receipts FOR SELECT
  USING (auth.uid() = merchant_id);

-- Insertion par le marchand authentifié
CREATE POLICY "Insertion reçu par marchand"
  ON public.receipts FOR INSERT
  WITH CHECK (auth.uid() = merchant_id);

-- Storage bucket pour les reçus (à créer via le dashboard ou l'API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true);
