import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

/**
 * POST /api/admin/withdrawals/[id]/approve
 * Admin approuve un retrait pending_review → invoke Edge Function approve-payout.
 * Cette route NE limite PAS par auto_approve_attempts (l'admin peut toujours forcer).
 */
export async function POST(
  _req: NextRequest,
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

  const admin = createAdminClient()
  const { data, error } = await admin.functions.invoke('approve-payout', {
    body: { withdrawal_id: id, reviewed_by: user.id },
  })
  if (error) {
    console.error('[admin/approve] invoke error:', error)
    return NextResponse.json({ error: 'Erreur Edge Function' }, { status: 502 })
  }
  return NextResponse.json(data)
}
