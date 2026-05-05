import { createClient } from '@/utils/supabase/server'
import WithdrawalsClient from './WithdrawalsClient'

export default async function WithdrawalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: balanceRpc }, { data: withdrawals }, { data: profile }] = await Promise.all([
    supabase.rpc('get_merchant_balance', { p_merchant_id: user!.id }),
    supabase
      .from('withdrawals')
      .select('*')
      .eq('merchant_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('profiles')
      .select('full_name, mobile_money_number, country')
      .eq('id', user!.id)
      .single(),
  ])

  const balance = typeof balanceRpc === 'number' ? balanceRpc : Number(balanceRpc) || 0

  return (
    <WithdrawalsClient
      initialBalance={balance}
      initialWithdrawals={(withdrawals as any[]) ?? []}
      profileDefaults={{
        name: profile?.full_name ?? '',
        phone: profile?.mobile_money_number ?? '',
        country: profile?.country ?? 'bj',
      }}
    />
  )
}
