// @ts-nocheck — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * Scanne les retraits pending_review < 100k avec attempts < 3, et déclenche approve-payout.
 * Auth: header Authorization: Bearer ${CRON_SECRET}.
 */
Deno.serve(async (req) => {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: rows } = await supa
    .from('withdrawals')
    .select('id')
    .eq('status', 'pending_review')
    .lt('amount', 100000)
    .lt('auto_approve_attempts', 3)
    .limit(50)

  let processed = 0
  for (const r of rows ?? []) {
    try {
      await supa.functions.invoke('approve-payout', { body: { withdrawal_id: r.id } })
      processed++
    } catch (e) {
      console.error('[auto-approve-batch] invoke failed for', r.id, e)
    }
  }
  return new Response(JSON.stringify({ processed }), { status: 200 })
})
