-- ============================================================
-- Ajout du cycle de facturation sur la table products
-- Valeurs : 'one_time' | 'monthly' | 'yearly'
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'one_time'
    CHECK (billing_cycle IN ('one_time', 'monthly', 'yearly'));
