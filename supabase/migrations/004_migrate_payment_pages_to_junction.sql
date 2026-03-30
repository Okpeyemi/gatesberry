-- ============================================================
-- Migration différentielle : payment_pages → junction table
-- À exécuter si vous avez déjà lancé l'ancienne version de 003
-- (celle avec product_id sur payment_pages).
-- ============================================================

-- 1. Supprimer l'ancienne colonne product_id
ALTER TABLE public.payment_pages
  DROP COLUMN IF EXISTS product_id;

-- 2. Créer la table de jonction (si elle n'existe pas déjà)
CREATE TABLE IF NOT EXISTS public.payment_page_products (
  page_id     UUID    NOT NULL REFERENCES public.payment_pages(id) ON DELETE CASCADE,
  product_id  UUID    NOT NULL REFERENCES public.products(id)      ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page_id, product_id)
);

CREATE INDEX IF NOT EXISTS ppp_page_id_idx ON public.payment_page_products (page_id);

-- 3. RLS sur la junction table
ALTER TABLE public.payment_page_products ENABLE ROW LEVEL SECURITY;

-- (DROP d'abord pour éviter les doublons si relancé)
DROP POLICY IF EXISTS "Gestion produits de pages personnels"   ON public.payment_page_products;
DROP POLICY IF EXISTS "Lecture publique produits de pages actives" ON public.payment_page_products;

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
