import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * GET /api/admin/withdrawals?status=pending_review
 * Liste tous les retraits (admin only), filtrable par status.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get('status')   // null = tous
  const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10)))
  const from = page * pageSize
  const to = from + pageSize - 1

  let q = supabase
    .from('withdrawals')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status) {
    if (status.includes(',')) q = q.in('status', status.split(','))
    else q = q.eq('status', status)
  }

  const { data, error, count } = await q
  if (error) {
    console.error('[admin/withdrawals] error:', error)
    return NextResponse.json({ error: 'Erreur de lecture' }, { status: 500 })
  }

  // Joindre nom marchand côté admin (RLS admin lit tous les profils)
  // Note : profiles n'a pas de colonne email — l'email vit dans auth.users (pas accessible
  // sans service_role). On affiche full_name uniquement côté admin.
  const merchantIds = Array.from(new Set((data ?? []).map(w => w.merchant_id)))
  const { data: merchants } = merchantIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', merchantIds)
    : { data: [] }
  const merchantsById = new Map((merchants ?? []).map(m => [m.id, m]))

  const enriched = (data ?? []).map(w => ({
    ...w,
    merchant: merchantsById.get(w.merchant_id) ?? null,
  }))

  return NextResponse.json({ withdrawals: enriched, total: count ?? 0 })
}
