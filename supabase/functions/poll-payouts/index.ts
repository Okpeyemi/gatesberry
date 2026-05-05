// @ts-nocheck — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const FEDAPAY_SECRET = Deno.env.get('FEDAPAY_SECRET_KEY')!
const FEDAPAY_ENV = Deno.env.get('FEDAPAY_ENVIRONMENT') ?? 'sandbox'
const FEDAPAY_BASE = FEDAPAY_ENV === 'live'
  ? 'https://api.fedapay.com/v1'
  : 'https://sandbox-api.fedapay.com/v1'

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const FEDAPAY_TO_DB: Record<string, string> = {
  pending: 'sent_to_fedapay',
  started: 'sent_to_fedapay',
  processing: 'processing',
  sent: 'sent',
  failed: 'failed',
}

const TERMINAL_DB = new Set(['sent', 'failed', 'rejected', 'cancelled'])

/**
 * Polling des retraits non terminaux pour récupérer le status FedaPay.
 * Filet anti-perte de webhook.
 */
Deno.serve(async (req) => {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: rows } = await supa
    .from('withdrawals')
    .select('id, fedapay_payout_id, status')
    .in('status', ['sent_to_fedapay', 'processing'])
    .not('fedapay_payout_id', 'is', null)
    .lt('updated_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .limit(50)

  let updated = 0
  for (const w of rows ?? []) {
    try {
      const r = await fetch(`${FEDAPAY_BASE}/payouts/${w.fedapay_payout_id}`, {
        headers: { Authorization: `Bearer ${FEDAPAY_SECRET}` },
      })
      if (!r.ok) {
        console.error('[poll-payouts] FedaPay GET failed', w.fedapay_payout_id, r.status)
        continue
      }
      const body = await r.json()
      const payout = body['v1/payout'] ?? body?.payout ?? body
      const fpStatus: string = payout.status
      const newDbStatus = FEDAPAY_TO_DB[fpStatus]
      if (!newDbStatus || newDbStatus === w.status) continue

      const patch: Record<string, unknown> = { status: newDbStatus }
      if (newDbStatus === 'sent') patch.sent_at = new Date().toISOString()
      if (newDbStatus === 'failed') patch.failure_reason = payout.failed_reason ?? payout.failure_reason ?? 'unknown'

      // Idempotent : ne touche pas les terminaux
      const { data: u } = await supa
        .from('withdrawals')
        .update(patch)
        .eq('id', w.id)
        .not('status', 'in', `(${[...TERMINAL_DB].join(',')})`)
        .select()
        .single()
      if (u) updated++
    } catch (e) {
      console.error('[poll-payouts] exception', w.id, e)
    }
  }
  return new Response(JSON.stringify({ checked: rows?.length ?? 0, updated }), { status: 200 })
})
