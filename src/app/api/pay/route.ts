import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const FEDAPAY_SECRET = process.env.FEDAPAY_SECRET_KEY!
const FEDAPAY_ENV = process.env.FEDAPAY_ENVIRONMENT ?? 'sandbox'
const FEDAPAY_BASE =
  FEDAPAY_ENV === 'live'
    ? 'https://api.fedapay.com/v1'
    : 'https://sandbox-api.fedapay.com/v1'

// Taux opérateur par (pays, provider)
const OPERATOR_FEES: Record<string, Record<string, number>> = {
  bj: { mtn: 1.8, moov: 1.8, celtiis: 1.8 },
  ci: { wave: 4.0, mtn: 4.0, orange: 3.3 },
  sn: { wave: 4.0, orange: 2.9, mixx: 2.0 },
  tg: { moov: 2.5, mixx: 3.5 },
  ml: { orange: 4.0 },
  bf: { moov: 4.0, orange: 4.0 },
  ne: { airtel: 4.0 },
}

/**
 * Calcule le montant total affiché au client (frais opérateur + Gatesberry inclus)
 * pour que le marchand reçoive exactement `merchantAmount` net.
 */
function computeClientAmount(merchantAmount: number, country: string, provider: string) {
  const opRate = OPERATOR_FEES[country]?.[provider] ?? 3.0

  const gbRate = merchantAmount < 10000 ? 2 : 1
  const gbFixed = merchantAmount < 10000 ? 50 : 100
  const totalRate = opRate + gbRate
  let clientPays = Math.ceil((merchantAmount + gbFixed) / (1 - totalRate / 100))

  for (let i = 0; i < 500; i++) {
    const opFee = Math.round((clientPays * opRate) / 100)
    const gbFee = clientPays < 10000
      ? Math.round(clientPays * 0.02 + 50)
      : Math.round(clientPays * 0.01 + 100)
    const net = clientPays - (opFee + gbFee)
    if (net === merchantAmount) break
    else if (net < merchantAmount) clientPays++
    else clientPays--
  }

  const opFee = Math.round((clientPays * opRate) / 100)
  const gbFee = clientPays < 10000
    ? Math.round(clientPays * 0.02 + 50)
    : Math.round(clientPays * 0.01 + 100)

  return { clientPays, opFee, gbFee, totalFee: opFee + gbFee }
}

/**
 * Calcule le montant à envoyer à FedaPay pour que le client soit débité
 * exactement `targetClientPays`. FedaPay ajoute ses frais (opRate%) par-dessus
 * le montant de la transaction → on envoie moins.
 *
 *   fedapayAmount + round(fedapayAmount * opRate / 100) = targetClientPays
 */
function reverseFedapayAmount(targetClientPays: number, country: string, provider: string) {
  const opRate = OPERATOR_FEES[country]?.[provider] ?? 3.0
  let x = Math.floor(targetClientPays / (1 + opRate / 100))

  for (let i = 0; i < 500; i++) {
    const fee = Math.round((x * opRate) / 100)
    const total = x + fee
    if (total === targetClientPays) break
    else if (total < targetClientPays) x++
    else x--
  }

  return x
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { paymentPageId, productId, firstName, lastName, country, provider, phone, autoRenew } = body as {
      paymentPageId: string
      productId: string
      firstName: string
      lastName: string
      country: string
      provider: string
      phone: string
      autoRenew: boolean
    }

    if (!phone || !productId || !paymentPageId || !firstName || !lastName || !country || !provider) {
      return NextResponse.json({ error: 'Champs manquants' }, { status: 400 })
    }

    // ── Supabase (anon key – lecture publique) ────────────────
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => [], setAll: () => {} } }
    )

    // Récupérer le produit
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('id, name, description, price, user_id')
      .eq('id', productId)
      .single()

    if (prodErr || !product) {
      return NextResponse.json({ error: 'Produit introuvable' }, { status: 404 })
    }

    // Récupérer la page de paiement (pour le merchant_id)
    const { data: page, error: pageErr } = await supabase
      .from('payment_pages')
      .select('id, user_id, title')
      .eq('id', paymentPageId)
      .single()

    if (pageErr || !page) {
      return NextResponse.json({ error: 'Page introuvable' }, { status: 404 })
    }

    const merchantRef = `GB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // ── Calcul des frais (toujours supportés par le client) ───
    const { clientPays, gbFee } = computeClientAmount(product.price, country, provider)

    // Montant à envoyer à FedaPay : plus bas que clientPays pour que
    // FedaPay + ses frais = exactement clientPays (le montant affiché au client)
    const fedapayAmount = reverseFedapayAmount(clientPays, country, provider)

    console.log(`Fees: product=${product.price}, clientPays=${clientPays}, fedapayAmount=${fedapayAmount}, gbFee=${gbFee}`)

    // ── Appel direct à l'API REST FedaPay ─────────────────────

    // Normaliser le numéro de téléphone
    const cleanPhone = phone.replace(/\s+/g, '')

    // 1. Créer la transaction (montant réduit → FedaPay ajoute ses frais → client paie clientPays)
    const callbackUrl = `${req.nextUrl.origin}/api/payment/callback`

    const txRes = await fetch(`${FEDAPAY_BASE}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FEDAPAY_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: `${page.title} — ${product.name}`,
        amount: fedapayAmount,
        currency: { iso: 'XOF' },
        callback_url: callbackUrl,
        merchant_reference: merchantRef,
        customer: {
          firstname: firstName,
          lastname: lastName,
          email: "maqsoudt9@gmail.com",
          phone_number: {
            number: cleanPhone,
            country: country,
          },
        },
      }),
    })

    const txBody = await txRes.text()
    console.log('FedaPay create status:', txRes.status, 'body:', txBody)

    if (!txRes.ok) {
      console.error('FedaPay create error:', txBody)
      return NextResponse.json(
        { error: 'Erreur lors de la création du paiement' },
        { status: 502 }
      )
    }

    const txData = JSON.parse(txBody)
    // L'API FedaPay retourne { "v1/transaction": { id, payment_token, payment_url, ... } }
    const tx = txData['v1/transaction'] ?? txData?.v1?.transaction ?? txData
    const fedapayTxId: number = tx.id
    const token: string = tx.payment_token
    const paymentUrl: string = tx.payment_url

    if (!fedapayTxId || !paymentUrl) {
      console.error('FedaPay: réponse inattendue:', txBody)
      return NextResponse.json(
        { error: 'Réponse FedaPay inattendue' },
        { status: 502 }
      )
    }

    // 3. Sauvegarder la transaction en base (statut pending)
    console.log('[Pay] Saving with fedapay_transaction_id:', fedapayTxId, typeof fedapayTxId)
    const { error: insertErr } = await supabase.from('transactions').insert({
      payment_page_id: paymentPageId,
      product_id: productId,
      merchant_id: page.user_id,
      fedapay_transaction_id: fedapayTxId,
      merchant_reference: merchantRef,
      amount: product.price,
      amount_charged: clientPays,
      gb_fee: gbFee,
      status: 'pending',
      customer_phone: cleanPhone,
      customer_firstname: firstName,
      customer_lastname: lastName,
      customer_country: country,
      provider: provider,
      auto_renew: autoRenew ?? false,
    })
    if (insertErr) console.error('[Pay] INSERT error:', insertErr)
    else console.log('[Pay] INSERT success for fedapay_transaction_id:', fedapayTxId)

    return NextResponse.json({ token, url: paymentUrl, transactionId: fedapayTxId })
  } catch (err) {
    console.error('Payment API error:', err)
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    )
  }
}
