import { createClient } from '@/utils/supabase/server'
import TransactionsClient from './TransactionsClient'

export default async function TransactionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id,
      fedapay_transaction_id,
      amount,
      amount_charged,
      gb_fee,
      status,
      customer_phone,
      customer_firstname,
      customer_lastname,
      customer_country,
      provider,
      created_at,
      products ( name ),
      payment_pages ( title, slug )
    `)
    .eq('merchant_id', user!.id)
    .order('created_at', { ascending: false })

  // Récupérer les reçus existants
  const txIds = (transactions ?? []).map((t) => t.id)
  const { data: receipts } = txIds.length > 0
    ? await supabase
        .from('receipts')
        .select('transaction_id')
        .in('transaction_id', txIds)
    : { data: [] }

  const receiptSet = new Set((receipts ?? []).map((r) => r.transaction_id))

  return (
    <TransactionsClient
      transactions={(transactions as any[]) ?? []}
      existingReceipts={Array.from(receiptSet)}
    />
  )
}
