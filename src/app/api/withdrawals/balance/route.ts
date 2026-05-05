import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * GET /api/withdrawals/balance
 * Renvoie le solde retirable du marchand connecté.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data, error } = await supabase.rpc('get_merchant_balance', {
    p_merchant_id: user.id,
  })

  if (error) {
    console.error('[balance] RPC error:', error)
    return NextResponse.json({ error: 'Erreur de calcul' }, { status: 500 })
  }

  const balance = typeof data === 'number' ? data : Number(data)
  return NextResponse.json({ balance: Number.isFinite(balance) ? balance : 0 })
}
