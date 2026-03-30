-- ============================================================
-- Table: payment_pages
-- Pages de paiement partagées par chaque marchand.
-- Les produits sont liés via la table de jonction payment_page_products.
-- ============================================================

CREATE TABLE public.payment_pages (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  description TEXT,
  slug        TEXT        NOT NULL UNIQUE,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX payment_pages_user_id_idx ON public.payment_pages (user_id);
CREATE INDEX payment_pages_slug_idx    ON public.payment_pages (slug);

-- ── Table de jonction pages ↔ produits ─────────────────────
CREATE TABLE public.payment_page_products (
  page_id     UUID    NOT NULL REFERENCES public.payment_pages(id) ON DELETE CASCADE,
  product_id  UUID    NOT NULL REFERENCES public.products(id)      ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page_id, product_id)
);

CREATE INDEX ppp_page_id_idx ON public.payment_page_products (page_id);

-- ── RLS : payment_pages ────────────────────────────────────
ALTER TABLE public.payment_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestion pages personnelles"
  ON public.payment_pages FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Lecture publique des pages actives (clients qui paient)
CREATE POLICY "Lecture publique pages actives"
  ON public.payment_pages FOR SELECT
  USING (is_active = TRUE);

-- ── RLS : payment_page_products ───────────────────────────
ALTER TABLE public.payment_page_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestion produits de pages personnels"
  ON public.payment_page_products FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.payment_pages pp WHERE pp.id = page_id AND pp.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.payment_pages pp WHERE pp.id = page_id AND pp.user_id = auth.uid())
  );

CREATE POLICY "Lecture publique produits de pages actives"
  ON public.payment_page_products FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.payment_pages pp WHERE pp.id = page_id AND pp.is_active = TRUE)
  );

-- ── Trigger updated_at ──────────────────────────────────────
CREATE TRIGGER payment_pages_updated_at
  BEFORE UPDATE ON public.payment_pages
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
