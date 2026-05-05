import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/utils/supabase/admin'

const FEDAPAY_WEBHOOK_SECRET = process.env.FEDAPAY_WEBHOOK_SECRET!

const FEDAPAY_TO_DB: Record<string, string> = {
  'payout.processing': 'processing',
  'payout.sent': 'sent',
  'payout.failed': 'failed',
}

const TERMINAL_DB = new Set(['sent', 'failed', 'rejected', 'cancelled'])

/**
 * POST /api/payouts/webhook
 * Reçoit les events FedaPay payouts. Bonus (le polling reste primary).
 */
export async function POST(req: NextRequest) {
  const sigHeader = req.headers.get('x-fedapay-signature') ?? ''
  const raw = await req.text()

  // Vérif HMAC SHA256 du body brut
  const expected = crypto.createHmac('sha256', FEDAPAY_WEBHOOK_SECRET).update(raw).digest('hex')
  // FedaPay envoie potentiellement le format "t=...,v1=hash" — on vérifie la présence du hash
  if (!sigHeader.includes(expected)) {
    console.warn('[webhook] signature invalide')
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
  }

  let body: any
  try { body = JSON.parse(raw) } catch {
    return NextResponse.json({ error: 'Body invalide' }, { status: 400 })
  }

  const eventName: string = body?.name ?? body?.event ?? ''
  const payout = body?.entity ?? body?.payout ?? body?.data ?? null
  if (!payout?.id) return NextResponse.json({ ok: true, ignored: 'no payout id' })

  const newDbStatus = FEDAPAY_TO_DB[eventName]
  if (!newDbStatus) return NextResponse.json({ ok: true, ignored: eventName })

  const admin = createAdminClient()

  const patch: Record<string, unknown> = { status: newDbStatus }
  if (newDbStatus === 'sent') patch.sent_at = new Date().toISOString()
  if (newDbStatus === 'failed') patch.failure_reason = payout.failed_reason ?? payout.failure_reason ?? 'unknown'

  // Idempotent : pas d'écrasement d'un status terminal
  const { error } = await admin
    .from('withdrawals')
    .update(patch)
    .eq('fedapay_payout_id', payout.id)
    .not('status', 'in', `(${[...TERMINAL_DB].join(',')})`)
  if (error) {
    console.error('[webhook] update error', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
