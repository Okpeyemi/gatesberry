import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const FEDAPAY_SECRET = process.env.FEDAPAY_SECRET_KEY!
const FEDAPAY_ENV = process.env.FEDAPAY_ENVIRONMENT ?? 'sandbox'
const FEDAPAY_BASE =
  FEDAPAY_ENV === 'live'
    ? 'https://api.fedapay.com/v1'
    : 'https://sandbox-api.fedapay.com/v1'

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

    // ── Appel direct à l'API REST FedaPay ─────────────────────

    // Normaliser le numéro de téléphone
    const cleanPhone = phone.replace(/\s+/g, '')

    // 1. Créer la transaction
    const callbackUrl = `${req.nextUrl.origin}/payment/callback`

    const txRes = await fetch(`${FEDAPAY_BASE}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FEDAPAY_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: `${page.title} — ${product.name}`,
        amount: product.price,
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
    await supabase.from('transactions').insert({
      payment_page_id: paymentPageId,
      product_id: productId,
      merchant_id: page.user_id,
      fedapay_transaction_id: fedapayTxId,
      merchant_reference: merchantRef,
      amount: product.price,
      status: 'pending',
      customer_phone: cleanPhone,
      customer_firstname: firstName,
      customer_lastname: lastName,
      customer_country: country,
      provider: provider,
      auto_renew: autoRenew ?? false,
    })

    return NextResponse.json({ token, url: paymentUrl, transactionId: fedapayTxId })
  } catch (err) {
    console.error('Payment API error:', err)
    return NextResponse.json(
      { error: 'Erreur interne du serveur' },
      { status: 500 }
    )
  }
}
