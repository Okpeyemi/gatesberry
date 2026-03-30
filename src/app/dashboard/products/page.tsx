import { createClient } from '@/utils/supabase/server'
import ProductsClient from './ProductsClient'

export default async function ProductsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: products } = await supabase
    .from('products')
    .select('id, name, description, price, currency, billing_cycle, is_active, created_at')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  return (
    <div style={{ padding: '40px 48px', flex: 1 }}>
      <ProductsClient
        initialProducts={products ?? []}
        userId={user!.id}
      />
    </div>
  )
}
