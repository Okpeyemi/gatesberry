-- ============================================================
-- pg_cron jobs pour la feature retraits.
-- Pré-requis : extensions pg_cron + pg_net activées (via Supabase
-- Studio → Database → Extensions).
--
-- Avant d'exécuter cette migration, REMPLACER manuellement les valeurs
-- entre <...> par les vraies (CRON_SECRET et project ref Supabase).
-- ============================================================

-- Stocker le CRON_SECRET en setting Postgres (à exécuter une fois)
ALTER DATABASE postgres SET app.cron_secret = '<TON_CRON_SECRET>';

-- Stocker l'URL de base des Edge Functions
ALTER DATABASE postgres SET app.functions_url = 'https://<TON_PROJECT_REF>.supabase.co/functions/v1';

-- Job 1 : auto-approve-batch toutes les minutes
SELECT cron.schedule(
  'auto-approve-small-payouts',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.functions_url') || '/auto-approve-batch',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Job 2 : poll-payouts toutes les 5 minutes
SELECT cron.schedule(
  'poll-pending-payouts',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.functions_url') || '/poll-payouts',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
