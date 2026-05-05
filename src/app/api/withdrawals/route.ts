import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { reverseFedapayPayoutAmount } from '@/lib/fedapay/payout-fees'
import { FEDAPAY_OPERATOR_FEES } from '@/lib/fedapay/fees'

const MIN_AMOUNT = 500
const ADMIN_REVIEW_THRESHOLD = 100_000

function isProviderSupported(country: string, provider: string) {
  return FEDAPAY_OPERATOR_FEES.some(
    e => e.countryCode === country && e.providers.some(p => p.code === provider),
  )
}

/**
 * POST /api/withdrawals
 * Crée une demande de retrait. Toujours en pending_review.
 * Si amount >= 100k → notify-admin-payout (email).
 * Sinon → auto-approve-batch pg_cron prendra en charge sous 1 min.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 })
  }

  const { amount, receiver_name, receiver_phone, receiver_country, receiver_provider } = body as {
    amount: number
    receiver_name: string
    receiver_phone: string
    receiver_country: string
    receiver_provider: string
  }

  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < MIN_AMOUNT) {
    return NextResponse.json({ error: `Montant minimum ${MIN_AMOUNT} XOF` }, { status: 400 })
  }
  if (!receiver_name || !receiver_phone || !receiver_country || !receiver_provider) {
    return NextResponse.json({ error: 'Coordonnées incomplètes' }, { status: 400 })
  }
  if (!isProviderSupported(receiver_country, receiver_provider)) {
    return NextResponse.json({ error: 'Opérateur non supporté' }, { status: 400 })
  }

  const { fedapay_amount, fee } = reverseFedapayPayoutAmount(amount)

  const admin = createAdminClient()

  // Atomic : lock advisory + check 1/jour + check solde dans une seule transaction.
  // Toute requête concurrente du même marchand attendra ce lock.
  const { data: slot, error: slotErr } = await admin.rpc('acquire_withdrawal_slot', {
    p_merchant_id: user.id,
    p_fedapay_amount: fedapay_amount,
  })
  if (slotErr) {
    console.error('[withdrawals] acquire_withdrawal_slot error:', slotErr)
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 })
  }
  if (slot === 'duplicate') {
    return NextResponse.json({ error: 'Un seul retrait par jour' }, { status: 429 })
  }
  if (slot === 'insufficient') {
    return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 })
  }

  const merchant_reference = `GB-PAYOUT-${crypto.randomUUID()}`

  const { data: inserted, error: insErr } = await admin
    .from('withdrawals')
    .insert({
      merchant_id: user.id,
      amount,
      fedapay_amount,
      fee,
      receiver_name,
      receiver_phone,
      receiver_country,
      receiver_provider,
      merchant_reference,
      status: 'pending_review',
    })
    .select()
    .single()

  if (insErr || !inserted) {
    console.error('[withdrawals] INSERT error:', insErr)
    return NextResponse.json({ error: 'Erreur de création' }, { status: 500 })
  }

  // Notifier admin si >= 100k (best-effort, on ne bloque pas la réponse)
  if (amount >= ADMIN_REVIEW_THRESHOLD) {
    admin.functions
      .invoke('notify-admin-payout', { body: { withdrawal_id: inserted.id } })
      .catch((e) => console.error('[withdrawals] notify-admin-payout invoke failed:', e))
  }

  return NextResponse.json({ withdrawal: inserted }, { status: 201 })
}

/**
 * GET /api/withdrawals
 * Liste paginée des retraits du marchand connecté.
 * Query params: ?page=0 (défaut 0), ?pageSize=10 (défaut 10).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const url = new URL(req.url)
  const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0', 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '10', 10)))
  const from = page * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await supabase
    .from('withdrawals')
    .select('*', { count: 'exact' })
    .eq('merchant_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('[withdrawals] GET error:', error)
    return NextResponse.json({ error: 'Erreur de lecture' }, { status: 500 })
  }

  return NextResponse.json({ withdrawals: data ?? [], total: count ?? 0 })
}
