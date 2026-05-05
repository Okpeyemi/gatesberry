-- ============================================================
-- pg_cron jobs pour la feature retraits.
-- Pré-requis : extensions pg_cron + pg_net activées (via Supabase
-- Studio → Database → Extensions).
--
-- IMPORTANT : avant d'exécuter, remplacer dans CHAQUE cron.schedule :
--   - <PROJECT_REF>   par ton ref Supabase (ex. abcdefghijklmnop)
--   - <CRON_SECRET>   par la valeur de CRON_SECRET (.env.local)
--
-- Note : on inline les valeurs dans le corps SQL du cron parce que
-- le worker pg_cron de Supabase n'évalue pas `current_setting()` au
-- runtime du job (les `ALTER DATABASE ... SET app.xxx` ne sont pas
-- visibles dans le contexte d'exécution du cron). Le secret se
-- retrouve donc dans cron.job — visible uniquement aux superusers
-- du projet, ce qui est acceptable côté Supabase.
-- ============================================================

-- Job 1 : auto-approve-batch toutes les minutes
SELECT cron.schedule(
  'auto-approve-small-payouts',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/auto-approve-batch',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <CRON_SECRET>',
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
      url := 'https://<PROJECT_REF>.supabase.co/functions/v1/poll-payouts',
      headers := jsonb_build_object(
        'Authorization', 'Bearer <CRON_SECRET>',
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
