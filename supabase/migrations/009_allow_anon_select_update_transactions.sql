-- Le callback FedaPay utilise la clé anon. Pour pouvoir SELECT puis UPDATE
-- une transaction par son fedapay_transaction_id, le rôle anon a besoin
-- d'une policy SELECT sur la table.

CREATE POLICY "Lecture transaction par fedapay_id (anon)"
  ON public.transactions FOR SELECT
  TO anon
  USING (TRUE);
