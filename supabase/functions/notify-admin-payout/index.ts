// @ts-nocheck — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('RESEND_FROM') ?? 'Gatesberry <noreply@gatesberry.com>'
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:3000'

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * Email aux admins quand un retrait >= 100k arrive en pending_review.
 * Input body: { withdrawal_id: string }
 */
Deno.serve(async (req) => {
  try {
    const { withdrawal_id } = await req.json()
    if (!withdrawal_id) return new Response(JSON.stringify({ error: 'withdrawal_id requis' }), { status: 400 })

    const { data: w, error: wErr } = await supa
      .from('withdrawals')
      .select('amount, receiver_phone, merchant_id')
      .eq('id', withdrawal_id)
      .single()
    if (wErr || !w) return new Response(JSON.stringify({ error: 'withdrawal introuvable' }), { status: 404 })

    const { data: merchant } = await supa
      .from('profiles')
      .select('full_name')
      .eq('id', w.merchant_id)
      .single()
    const merchantName = merchant?.full_name ?? '(marchand inconnu)'

    // Récupérer admins
    const { data: admins } = await supa
      .from('profiles')
      .select('id')
      .eq('is_admin', true)
    const adminIds = (admins ?? []).map(a => a.id)
    if (adminIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 })
    }
    // Récupérer les emails depuis auth.users via admin API
    const adminEmails: string[] = []
    for (const id of adminIds) {
      const { data: u } = await supa.auth.admin.getUserById(id)
      if (u?.user?.email) adminEmails.push(u.user.email)
    }
    if (adminEmails.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 })
    }

    const subject = `Nouveau retrait à valider — ${w.amount.toLocaleString('fr-FR')} XOF`
    const html = `
      <p>Un retrait nécessite ta validation.</p>
      <ul>
        <li><b>Marchand :</b> ${merchantName}</li>
        <li><b>Montant :</b> ${w.amount.toLocaleString('fr-FR')} XOF</li>
        <li><b>Téléphone :</b> ${w.receiver_phone}</li>
      </ul>
      <p><a href="${APP_URL}/dashboard/admin/withdrawals">Ouvrir la console admin</a></p>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: adminEmails, subject, html }),
    })
    if (!r.ok) {
      const t = await r.text()
      console.error('[notify-admin-payout] Resend error', r.status, t)
      return new Response(JSON.stringify({ error: 'Resend failed', detail: t }), { status: 502 })
    }
    return new Response(JSON.stringify({ ok: true, sent: adminEmails.length }), { status: 200 })
  } catch (err) {
    console.error('[notify-admin-payout] exception', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
