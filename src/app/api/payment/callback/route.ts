import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateReceiptPdf } from '@/lib/generate-receipt-pdf'

const FEDAPAY_SECRET = process.env.FEDAPAY_SECRET_KEY!
const FEDAPAY_ENV = process.env.FEDAPAY_ENVIRONMENT ?? 'sandbox'
const FEDAPAY_BASE =
  FEDAPAY_ENV === 'live'
    ? 'https://api.fedapay.com/v1'
    : 'https://sandbox-api.fedapay.com/v1'

// Service-role client: ce callback est server-only et doit bypasser la RLS
// pour mettre à jour des transactions et insérer des reçus au nom du marchand,
// alors que le payeur n'est pas authentifié.
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY manquante dans l\'environnement')
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

/**
 * FedaPay redirige ici après paiement : GET /api/payment/callback?id=XXX&status=YYY
 * On vérifie auprès de FedaPay, on met à jour Supabase, puis on génère le reçu si approuvé,
 * puis on redirige vers la page de résultat.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const id = searchParams.get('id')
  const urlStatus = searchParams.get('status') ?? 'unknown'

  let finalStatus = urlStatus
  let receiptUrl: string | null = null

  console.log(`[API Callback] Received: id=${id}, status=${urlStatus}`)

  if (id) {
    // 1. Vérifier le vrai statut auprès de FedaPay
    try {
      const res = await fetch(`${FEDAPAY_BASE}/transactions/${id}`, {
        headers: {
          Authorization: `Bearer ${FEDAPAY_SECRET}`,
          'Content-Type': 'application/json',
        },
      })

      if (res.ok) {
        const data = await res.json()
        const tx = data['v1/transaction'] ?? data
        finalStatus = tx.status ?? finalStatus
        console.log(`[API Callback] FedaPay verify: tx ${id} status=${finalStatus}`)
      } else {
        console.error(`[API Callback] FedaPay verify failed: ${res.status} ${await res.text()}`)
      }
    } catch (err) {
      console.error('[API Callback] FedaPay verify error:', err)
    }

    // 2. Mettre à jour le statut dans Supabase
    const { data: updated, error: updateErr } = await supabase
      .from('transactions')
      .update({ status: finalStatus })
      .eq('fedapay_transaction_id', Number(id))
      .select('id, merchant_id, status')

    console.log('[API Callback] Update result:', { updated, updateErr })

    // 3. Si approuvé, générer le reçu automatiquement
    if (finalStatus === 'approved' && updated && updated.length > 0) {
      const txRow = updated[0]
      try {
        // Récupérer les détails complets de la transaction
        const { data: fullTx } = await supabase
          .from('transactions')
          .select(`
            id, fedapay_transaction_id, amount, amount_charged, gb_fee,
            status, customer_phone, customer_firstname, customer_lastname,
            customer_country, provider, created_at,
            products ( name, price, currency ),
            payment_pages ( title )
          `)
          .eq('id', txRow.id)
          .single()

        if (fullTx) {
          // Récupérer le nom du marchand
          const { data: profile } = await supabase
            .from('profiles')
            .select('business_name')
            .eq('id', txRow.merchant_id)
            .single()

          const merchantName = profile?.business_name ?? 'Marchand'
          const pdfBuffer = await generateReceiptPdf(fullTx as any, merchantName)
          const filePath = `${txRow.merchant_id}/${txRow.id}.pdf`

          // Upload sur Storage
          const { error: uploadErr } = await supabase.storage
            .from('receipts')
            .upload(filePath, pdfBuffer, {
              contentType: 'application/pdf',
              upsert: true,
            })

          if (uploadErr) {
            console.error('[API Callback] Receipt upload error:', uploadErr)
          } else {
            // Sauvegarder la référence en base (upsert pour idempotence
            // si le callback est rejoué par FedaPay)
            const { error: insertErr } = await supabase
              .from('receipts')
              .upsert(
                {
                  transaction_id: txRow.id,
                  merchant_id: txRow.merchant_id,
                  file_path: filePath,
                },
                { onConflict: 'transaction_id' },
              )

            if (insertErr) {
              console.error('[API Callback] Receipt insert error:', insertErr)
            } else {
              console.log('[API Callback] Receipt created for tx:', txRow.id)
            }

            // Générer une URL signée pour le téléchargement
            const { data: signed } = await supabase.storage
              .from('receipts')
              .createSignedUrl(filePath, 60 * 30) // 30 min
            if (signed?.signedUrl) receiptUrl = signed.signedUrl
          }
        }
      } catch (err) {
        console.error('[API Callback] Receipt generation error:', err)
      }
    }
  }

  // 4. Rediriger vers la page de résultat
  const resultUrl = new URL('/payment/callback', req.nextUrl.origin)
  resultUrl.searchParams.set('status', finalStatus)
  if (id) resultUrl.searchParams.set('id', id)
  if (receiptUrl) resultUrl.searchParams.set('receipt', receiptUrl)

  return NextResponse.redirect(resultUrl)
}
