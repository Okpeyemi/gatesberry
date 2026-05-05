"use client"

import { useState, useMemo } from 'react'

type AdminWithdrawal = {
  id: string
  amount: number
  fedapay_amount: number | null
  fee: number | null
  status: string
  receiver_name: string
  receiver_phone: string
  receiver_country: string
  receiver_provider: string
  rejection_reason: string | null
  failure_reason: string | null
  fedapay_payout_id: number | null
  merchant_reference: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  sent_at: string | null
  created_at: string
  merchant_name: string
}

type Tab = 'pending' | 'in_progress' | 'done' | 'all'

const TABS: { key: Tab; label: string; statuses: string[] | null }[] = [
  { key: 'pending',     label: 'À valider',  statuses: ['pending_review'] },
  { key: 'in_progress', label: 'En cours',   statuses: ['approved', 'sent_to_fedapay', 'processing'] },
  { key: 'done',        label: 'Terminés',   statuses: ['sent', 'failed', 'rejected', 'cancelled'] },
  { key: 'all',         label: 'Tous',       statuses: null },
]

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pending_review:   { label: 'En attente',  color: '#9a6a00', bg: '#fff3d6' },
  approved:         { label: 'Approuvé',    color: '#1d4ed8', bg: '#dbe4ff' },
  sent_to_fedapay:  { label: 'En cours',    color: '#1d4ed8', bg: '#dbe4ff' },
  processing:       { label: 'En cours',    color: '#1d4ed8', bg: '#dbe4ff' },
  sent:             { label: 'Envoyé',      color: '#15803d', bg: '#dcfce7' },
  failed:           { label: 'Échoué',      color: '#b91c1c', bg: '#fee2e2' },
  rejected:         { label: 'Refusé',      color: '#b91c1c', bg: '#fee2e2' },
  cancelled:        { label: 'Annulé',      color: '#525252', bg: '#f3f4f6' },
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n)

export default function AdminWithdrawalsClient({
  initialWithdrawals,
}: { initialWithdrawals: AdminWithdrawal[] }) {
  const [items, setItems] = useState(initialWithdrawals)
  const [tab, setTab] = useState<Tab>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const filtered = useMemo(() => {
    const t = TABS.find(t => t.key === tab)!
    return t.statuses ? items.filter(w => t.statuses!.includes(w.status)) : items
  }, [items, tab])

  const pendingCount = items.filter(w => w.status === 'pending_review').length

  const refresh = async () => {
    const r = await fetch('/api/admin/withdrawals?pageSize=100')
    if (!r.ok) return
    const data = await r.json()
    setItems(data.withdrawals.map((w: any) => ({
      ...w,
      merchant_name: w.merchant?.full_name ?? '(inconnu)',
    })))
  }

  const handleApprove = async (id: string) => {
    if (!confirm('Approuver et déclencher le versement FedaPay ?')) return
    setBusy(id)
    const r = await fetch(`/api/admin/withdrawals/${id}/approve`, { method: 'POST' })
    setBusy(null)
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error ?? 'Erreur'); return }
    await refresh()
  }

  const handleReject = async () => {
    if (!rejectingId) return
    if (!rejectReason.trim()) { alert('Motif obligatoire'); return }
    setBusy(rejectingId)
    const r = await fetch(`/api/admin/withdrawals/${rejectingId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: rejectReason.trim() }),
    })
    setBusy(null)
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error ?? 'Erreur'); return }
    setRejectingId(null); setRejectReason('')
    await refresh()
  }

  return (
    <div style={{ width:'100%', margin:'0 auto', padding:'32px 24px' }}>
      <h1 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:24, marginBottom:6 }}>
        Retraits — vue admin
      </h1>
      <p style={{ color:'var(--color-text-muted)', fontSize:13, marginBottom:20 }}>
        {pendingCount} en attente
      </p>

      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding:'8px 14px', borderRadius:8, border:'1px solid var(--color-border)',
            background: tab === t.key ? 'var(--color-accent)' : '#fff',
            color: tab === t.key ? '#fff' : 'var(--color-text)',
            fontSize:13, fontWeight:600, cursor:'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ background:'#fff', border:'1px solid var(--color-border)', borderRadius:14, overflow:'hidden' }}>
        <div style={{
          padding:'10px 16px', display:'grid',
          gridTemplateColumns:'0.8fr 1.3fr 0.9fr 0.9fr 1.4fr 0.8fr 1.1fr',
          fontSize:11, fontWeight:600, color:'var(--color-text-muted)', textTransform:'uppercase',
          background:'var(--color-surface)', gap:10,
        }}>
          <span>Date</span><span>Marchand</span><span>Net</span><span>Débité</span>
          <span>Coordonnées</span><span>Statut</span><span>Actions</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding:'40px 24px', textAlign:'center', color:'var(--color-text-muted)' }}>
            Aucun retrait dans cet onglet 🎉
          </div>
        ) : filtered.map(w => (
          <div key={w.id} style={{
            padding:'14px 16px', display:'grid',
            gridTemplateColumns:'0.8fr 1.3fr 0.9fr 0.9fr 1.4fr 0.8fr 1.1fr',
            alignItems:'center', borderTop:'1px solid var(--color-border)', gap:10, fontSize:13,
          }}>
            <span style={{ color:'var(--color-text-muted)' }}>
              {new Date(w.created_at).toLocaleDateString('fr-FR')}
            </span>
            <span>{w.merchant_name}</span>
            <span style={{ fontWeight:600 }}>{fmt(w.amount)}</span>
            <span>{w.fedapay_amount ? fmt(w.fedapay_amount) : '—'}</span>
            <span>{w.receiver_phone} · {w.receiver_provider.toUpperCase()}</span>
            <span style={{
              fontSize:11, fontWeight:600, padding:'3px 8px', borderRadius:999,
              background: STATUS_LABEL[w.status]?.bg ?? '#eee',
              color: STATUS_LABEL[w.status]?.color ?? '#333',
              justifySelf:'start',
            }}>{STATUS_LABEL[w.status]?.label ?? w.status}</span>
            <div style={{ display:'flex', gap:6, justifySelf:'end' }}>
              {w.status === 'pending_review' && (
                <>
                  <button onClick={() => handleApprove(w.id)} disabled={busy === w.id}
                    style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #15803d',
                             background:'#dcfce7', color:'#15803d', fontSize:11, fontWeight:600,
                             cursor: busy === w.id ? 'wait' : 'pointer' }}>
                    Approuver
                  </button>
                  <button onClick={() => { setRejectingId(w.id); setRejectReason('') }}
                    disabled={busy === w.id}
                    style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #b91c1c',
                             background:'#fee2e2', color:'#b91c1c', fontSize:11, fontWeight:600,
                             cursor: busy === w.id ? 'wait' : 'pointer' }}>
                    Refuser
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {rejectingId && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setRejectingId(null) }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)',
                   display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:440, padding:24 }}>
            <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:18, marginBottom:12 }}>
              Refuser ce retrait
            </h2>
            <label style={{ fontSize:12, color:'var(--color-text-muted)' }}>Motif (visible par le marchand)</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3}
              style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--color-border)',
                       borderRadius:10, fontSize:14, marginTop:4, fontFamily:'inherit', resize:'vertical' }}
              placeholder="Ex. coordonnées invalides, vérification d'identité requise…" />
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={() => setRejectingId(null)}
                style={{ padding:'10px 16px', borderRadius:10, border:'1px solid var(--color-border)',
                         background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>Annuler</button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || busy !== null}
                style={{ padding:'10px 16px', borderRadius:10, border:'none',
                         background:'#b91c1c', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                Confirmer le refus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
