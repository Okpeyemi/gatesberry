import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

/**
 * POST /api/withdrawals/[id]/cancel
 * Annule un retrait en pending_review (du marchand authentifié).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()

  // UPDATE conditionnel : seulement si appartient à user ET status='pending_review'
  const { data, error } = await admin
    .from('withdrawals')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('merchant_id', user.id)
    .eq('status', 'pending_review')
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Annulation impossible' }, { status: 400 })
  }

  return NextResponse.json({ withdrawal: data })
}
