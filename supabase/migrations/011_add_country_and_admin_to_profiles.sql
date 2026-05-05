-- ============================================================
-- Migration: ajout colonnes country + is_admin à profiles
-- Pré-requis pour la feature retraits (FedaPay payouts)
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN country  TEXT,                              -- code ISO bj/ci/sn/tg/ml/bf/ne
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
