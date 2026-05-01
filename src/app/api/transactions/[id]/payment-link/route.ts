import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

const FEDAPAY_SECRET = process.env.FEDAPAY_SECRET_KEY!
const FEDAPAY_ENV = process.env.FEDAPAY_ENVIRONMENT ?? 'sandbox'
const FEDAPAY_BASE =
  FEDAPAY_ENV === 'live'
    ? 'https://api.fedapay.com/v1'
    : 'https://sandbox-api.fedapay.com/v1'

/**
 * GET /api/transactions/[id]/payment-link
 * Génère un lien de paiement frais pour une transaction pending
 * appartenant au marchand authentifié.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // RLS filtre déjà par merchant_id, mais on ajoute le filtre explicite
  // pour fail-fast et un message d'erreur plus clair.
  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .select('id, fedapay_transaction_id, status')
    .eq('id', id)
    .eq('merchant_id', user.id)
    .single()

  if (txErr || !tx) {
    return NextResponse.json({ error: 'Transaction introuvable' }, { status: 404 })
  }

  if (tx.status !== 'pending') {
    return NextResponse.json(
      { error: 'Transaction non éligible à la reprise' },
      { status: 400 },
    )
  }

  if (!tx.fedapay_transaction_id) {
    return NextResponse.json(
      { error: 'Transaction sans identifiant FedaPay' },
      { status: 400 },
    )
  }

  const fpRes = await fetch(
    `${FEDAPAY_BASE}/transactions/${tx.fedapay_transaction_id}/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FEDAPAY_SECRET}`,
        'Content-Type': 'application/json',
      },
    },
  )

  if (!fpRes.ok) {
    const body = await fpRes.text()
    console.error('[payment-link] FedaPay error:', fpRes.status, body)
    return NextResponse.json({ error: 'Erreur FedaPay' }, { status: 502 })
  }

  const data = await fpRes.json()
  const url: string | undefined = data?.token?.url ?? data?.url
  if (!url) {
    console.error('[payment-link] FedaPay: réponse inattendue:', data)
    return NextResponse.json({ error: 'Réponse FedaPay inattendue' }, { status: 502 })
  }

  return NextResponse.json({ url })
}
