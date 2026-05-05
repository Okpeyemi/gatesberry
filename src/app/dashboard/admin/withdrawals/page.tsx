import { createClient } from '@/utils/supabase/server'
import AdminWithdrawalsClient from './AdminWithdrawalsClient'

export default async function AdminWithdrawalsPage() {
  const supabase = await createClient()

  const { data: withdrawals } = await supabase
    .from('withdrawals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  // Joindre marchand (RLS admin permet la lecture de tous les profils)
  const ids = Array.from(new Set((withdrawals ?? []).map(w => w.merchant_id)))
  const { data: profiles } = ids.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] }
  const profilesById = new Map((profiles ?? []).map(p => [p.id, p]))

  const enriched = (withdrawals ?? []).map(w => ({
    ...w,
    merchant_name: profilesById.get(w.merchant_id)?.full_name ?? '(inconnu)',
  }))

  return <AdminWithdrawalsClient initialWithdrawals={enriched as any} />
}
