-- ============================================================
-- Permet la lecture publique des produits actifs
-- (nécessaire pour le flow de paiement côté client non authentifié)
-- ============================================================

CREATE POLICY "Lecture publique produits actifs"
  ON public.products FOR SELECT
  USING (is_active = TRUE);
