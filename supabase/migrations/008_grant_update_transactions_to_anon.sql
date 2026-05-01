-- Le callback FedaPay utilise la clé anon pour mettre à jour le statut
-- des transactions. Le RLS autorise déjà l'UPDATE (USING TRUE), mais
-- le rôle anon a besoin du GRANT explicite sur la table.

GRANT UPDATE ON public.transactions TO anon;
