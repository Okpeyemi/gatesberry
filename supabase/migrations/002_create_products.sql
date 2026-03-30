-- ============================================================
-- Table: products
-- Plans/produits créés par chaque marchand.
-- ============================================================

CREATE TABLE public.products (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  price       INTEGER     NOT NULL CHECK (price >= 0), -- en FCFA (entier)
  currency    TEXT        NOT NULL DEFAULT 'XOF',
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour les requêtes par utilisateur
CREATE INDEX products_user_id_idx ON public.products (user_id);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestion produits personnels"
  ON public.products FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Trigger updated_at ──────────────────────────────────────
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
