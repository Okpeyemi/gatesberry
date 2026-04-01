-- ============================================================
-- Ajout des infos client aux transactions
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN customer_firstname TEXT,
  ADD COLUMN customer_lastname  TEXT,
  ADD COLUMN customer_country   TEXT,
  ADD COLUMN provider            TEXT;
