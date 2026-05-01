import { createClient } from '@/utils/supabase/server'
import DashboardHomeClient from './DashboardHomeClient'

export default async function DashboardHomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const firstName = (user?.user_metadata?.full_name as string | undefined)
    ?.split(' ')[0] ?? 'Marchand'

  // Récupérer les transactions du marchand avec produit et page
  const { data: transactions } = await supabase
    .from('transactions')
    .select(`
      id,
      amount,
      status,
      customer_phone,
      customer_firstname,
      customer_lastname,
      created_at,
      products ( name ),
      payment_pages ( title, slug )
    `)
    .eq('merchant_id', user!.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <DashboardHomeClient
      firstName={firstName}
      transactions={(transactions as any[]) ?? []}
    />
  )
}
