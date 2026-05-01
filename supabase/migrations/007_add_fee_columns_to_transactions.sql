-- ============================================================
-- Ajout des colonnes de frais aux transactions
-- amount = montant net du marchand (prix produit)
-- amount_charged = montant total facturé au client (frais inclus)
-- gb_fee = commission Gatesberry
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN amount_charged INTEGER,
  ADD COLUMN gb_fee         INTEGER;
