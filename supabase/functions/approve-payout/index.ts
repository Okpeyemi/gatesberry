// @ts-nocheck — Deno runtime, pas de typings npm dans cet env
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FEDAPAY_SECRET = Deno.env.get('FEDAPAY_SECRET_KEY')!
const FEDAPAY_ENV = Deno.env.get('FEDAPAY_ENVIRONMENT') ?? 'sandbox'
const FEDAPAY_BASE = FEDAPAY_ENV === 'live'
  ? 'https://api.fedapay.com/v1'
  : 'https://sandbox-api.fedapay.com/v1'

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * Logique partagée admin manuel + cron auto-approve.
 * Input body: { withdrawal_id: string, reviewed_by?: string | null }
 *
 * Idempotent : si fedapay_payout_id est déjà connu (création précédente
 * ayant réussi mais start ayant échoué), on saute le POST /payouts et
 * on rejoue directement le PUT /start.
 */
Deno.serve(async (req) => {
  try {
    const { withdrawal_id, reviewed_by } = await req.json()
    if (!withdrawal_id) return new Response(JSON.stringify({ error: 'withdrawal_id requis' }), { status: 400 })

    // Lock optimiste : passer pending_review → sent_to_fedapay si encore éligible.
    // Incrémente aussi auto_approve_attempts dans le même UPDATE.
    const { data: current } = await supa
      .from('withdrawals')
      .select('auto_approve_attempts')
      .eq('id', withdrawal_id)
      .single()
    const nextAttempts = (current?.auto_approve_attempts ?? 0) + 1

    const { data: locked, error: lockErr } = await supa
      .from('withdrawals')
      .update({
        status: 'sent_to_fedapay',
        auto_approve_attempts: nextAttempts,
        reviewed_by: reviewed_by ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', withdrawal_id)
      .eq('status', 'pending_review')
      .select()
      .single()

    if (lockErr || !locked) {
      return new Response(
        JSON.stringify({ error: 'Retrait non éligible (status changé entretemps ?)' }),
        { status: 409 },
      )
    }

    let fedapayId: number | null = locked.fedapay_payout_id ?? null

    // 1. POST /v1/payouts UNIQUEMENT si on n'a pas déjà un fedapay_payout_id
    if (fedapayId == null) {
      const createRes = await fetch(`${FEDAPAY_BASE}/payouts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${FEDAPAY_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: locked.fedapay_amount,
          currency: { iso: 'XOF' },
          mode: locked.receiver_provider,
          merchant_reference: locked.merchant_reference,
          customer: {
            firstname: (locked.receiver_name as string).split(' ')[0],
            lastname: (locked.receiver_name as string).split(' ').slice(1).join(' ') || locked.receiver_name,
            phone_number: { number: locked.receiver_phone, country: locked.receiver_country },
          },
        }),
      })

      if (!createRes.ok) {
        const t = await createRes.text()
        console.error('[approve-payout] create error', createRes.status, t)
        // Rollback status
        await supa.from('withdrawals').update({ status: 'pending_review' }).eq('id', withdrawal_id)
        return new Response(JSON.stringify({ error: 'FedaPay create error', detail: t }), { status: 502 })
      }
      const createBody = await createRes.json()
      const payout = createBody['v1/payout'] ?? createBody?.payout ?? createBody
      fedapayId = payout.id

      // Persister TOUT DE SUITE pour qu'un retry après crash ne re-crée pas
      await supa
        .from('withdrawals')
        .update({ fedapay_payout_id: fedapayId })
        .eq('id', withdrawal_id)
    }

    // 2. PUT /v1/payouts/{id}/start
    const startRes = await fetch(`${FEDAPAY_BASE}/payouts/${fedapayId}/start`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${FEDAPAY_SECRET}`, 'Content-Type': 'application/json' },
    })
    if (!startRes.ok) {
      const t = await startRes.text()
      console.error('[approve-payout] start error', startRes.status, t)
      // Rollback status à pending_review (on garde fedapay_payout_id pour le retry idempotent)
      await supa
        .from('withdrawals')
        .update({ status: 'pending_review' })
        .eq('id', withdrawal_id)
      return new Response(JSON.stringify({ error: 'FedaPay start error', detail: t }), { status: 502 })
    }

    return new Response(JSON.stringify({ ok: true, fedapay_payout_id: fedapayId }), { status: 200 })
  } catch (err) {
    console.error('[approve-payout] exception', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
