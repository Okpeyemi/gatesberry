import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateReceiptPdf } from '@/lib/generate-receipt-pdf'

/**
 * GET /api/receipts?transactionId=xxx
 * Télécharge le reçu PDF.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const transactionId = req.nextUrl.searchParams.get('transactionId')
  if (!transactionId) return NextResponse.json({ error: 'transactionId requis' }, { status: 400 })

  const { data: receipt } = await supabase
    .from('receipts')
    .select('file_path')
    .eq('transaction_id', transactionId)
    .single()

  if (!receipt) return NextResponse.json({ error: 'Reçu non trouvé' }, { status: 404 })

  const { data: fileData, error: dlErr } = await supabase.storage
    .from('receipts')
    .download(receipt.file_path)

  if (dlErr || !fileData) {
    return NextResponse.json({ error: 'Fichier introuvable' }, { status: 404 })
  }

  const buffer = Buffer.from(await fileData.arrayBuffer())

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="recu-${transactionId}.pdf"`,
    },
  })
}

/**
 * POST /api/receipts  { transactionId }
 * Crée le reçu PDF, le stocke sur Supabase Storage.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { transactionId } = await req.json()
  if (!transactionId) return NextResponse.json({ error: 'transactionId requis' }, { status: 400 })

  // Vérifier si le reçu existe déjà
  const { data: existing } = await supabase
    .from('receipts')
    .select('file_path')
    .eq('transaction_id', transactionId)
    .single()

  if (existing) {
    return NextResponse.json({ exists: true })
  }

  // Récupérer la transaction complète
  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .select(`
      id, fedapay_transaction_id, amount, amount_charged, gb_fee,
      status, customer_phone, customer_firstname, customer_lastname,
      customer_country, provider, created_at,
      products ( name, price, currency ),
      payment_pages ( title )
    `)
    .eq('id', transactionId)
    .eq('merchant_id', user.id)
    .single()

  if (txErr || !tx) {
    return NextResponse.json({ error: 'Transaction introuvable' }, { status: 404 })
  }

  if (tx.status !== 'approved') {
    return NextResponse.json({ error: 'Seules les transactions approuvées peuvent avoir un reçu' }, { status: 400 })
  }

  // Récupérer le profil marchand
  const { data: profile } = await supabase
    .from('profiles')
    .select('business_name')
    .eq('id', user.id)
    .single()

  const merchantName = profile?.business_name ?? 'Marchand'
  const pdfBuffer = await generateReceiptPdf(tx as any, merchantName)
  const filePath = `${user.id}/${transactionId}.pdf`

  const { error: uploadErr } = await supabase.storage
    .from('receipts')
    .upload(filePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadErr) {
    console.error('[Receipts] Upload error:', uploadErr)
    return NextResponse.json({ error: 'Erreur lors du stockage du reçu' }, { status: 500 })
  }

  // Sauvegarder la référence en base
  await supabase.from('receipts').insert({
    transaction_id: transactionId,
    merchant_id: user.id,
    file_path: filePath,
  })

  return NextResponse.json({ created: true })
}
