import { headers } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import PaymentPagesClient from './PaymentPagesClient'

export default async function PaymentPagesPage() {
  const supabase = await createClient()
  const headersList = await headers()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: pages }, { data: products }] = await Promise.all([
    supabase
      .from('payment_pages')
      .select('id, title, description, slug, is_active, product_id, created_at, products(name, price)')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('products')
      .select('id, name, description, price, currency, is_active, created_at')
      .eq('user_id', user!.id)
      .eq('is_active', true)
      .order('name'),
  ])

  const host = headersList.get('host') ?? 'localhost:3000'
  const proto = process.env.NODE_ENV === 'development' ? 'http' : 'https'
  const origin = `${proto}://${host}`

  return (
    <div style={{ padding: '40px 48px', flex: 1 }}>
      <PaymentPagesClient
        initialPages={(pages ?? []) as any}
        products={products ?? []}
        userId={user!.id}
        origin={origin}
      />
    </div>
  )
}
