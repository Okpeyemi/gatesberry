-- ============================================================
-- Table: payment_pages
-- Pages de paiement partagées par chaque marchand.
-- ============================================================

CREATE TABLE public.payment_pages (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id  UUID        REFERENCES public.products(id) ON DELETE SET NULL,
  title       TEXT        NOT NULL,
  description TEXT,
  slug        TEXT        NOT NULL UNIQUE,   -- identifiant URL unique ex: "abonnement-premium-darell"
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payment_pages_user_id_idx ON public.payment_pages (user_id);
CREATE INDEX payment_pages_slug_idx    ON public.payment_pages (slug);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE public.payment_pages ENABLE ROW LEVEL SECURITY;

-- Le marchand gère ses propres pages
CREATE POLICY "Gestion pages personnelles"
  ON public.payment_pages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Lecture publique des pages actives (pour les clients qui paient)
CREATE POLICY "Lecture publique pages actives"
  ON public.payment_pages FOR SELECT
  USING (is_active = TRUE);

-- ── Trigger updated_at ──────────────────────────────────────
CREATE TRIGGER payment_pages_updated_at
  BEFORE UPDATE ON public.payment_pages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
