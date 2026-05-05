import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

/**
 * POST /api/admin/withdrawals/[id]/reject
 * Admin refuse un retrait pending_review. Motif obligatoire (visible marchand). Terminal.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 })
  }
  const reason = String(body?.reason ?? '').trim()
  if (!reason) return NextResponse.json({ error: 'Motif obligatoire' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('withdrawals')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending_review')
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Refus impossible (status non pending_review ?)' }, { status: 400 })
  }
  return NextResponse.json({ withdrawal: data })
}
