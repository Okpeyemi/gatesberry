import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase avec service_role key — bypass RLS.
 * À utiliser UNIQUEMENT côté serveur (route handlers Next.js, jamais côté client).
 * Réservé aux UPDATE de la table withdrawals (RLS bloque l'UPDATE direct).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
