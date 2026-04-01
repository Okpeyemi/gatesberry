import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import PayPageClient from './PayPageClient'
import type { PayProduct } from './PayPageClient'

export default async function PublicPayPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: page } = await supabase
    .from('payment_pages')
    .select('id, title, description, is_active, payment_page_products(sort_order, products(id, name, description, price, billing_cycle))')
    .eq('slug', slug)
    .single()

  if (!page || !page.is_active) notFound()

  const products = (page.payment_page_products as any[])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((pp) => pp.products)
    .filter(Boolean) as PayProduct[]

  return (
    <PayPageClient
      paymentPageId={page.id}
      title={page.title}
      description={page.description}
      products={products}
    />
  )
}
