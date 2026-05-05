"use client"

import { Fragment, useState, useMemo } from 'react'
import { FEDAPAY_PAYOUT_METHODS, PAYOUT_FEE_TIERS } from '@/lib/fedapay/payout-fees'

type Withdrawal = {
  id: string
  amount: number
  fedapay_amount: number | null
  fee: number | null
  status: 'pending_review'|'approved'|'rejected'|'sent_to_fedapay'|'processing'|'sent'|'failed'|'cancelled'
  receiver_name: string
  receiver_phone: string
  receiver_country: string
  receiver_provider: string
  rejection_reason: string | null
  failure_reason: string | null
  created_at: string
}

const STATUS_LABEL: Record<Withdrawal['status'], { label: string; color: string; bg: string }> = {
  pending_review:   { label: 'En attente',  color: '#9a6a00', bg: '#fff3d6' },
  approved:         { label: 'Approuvé',    color: '#1d4ed8', bg: '#dbe4ff' },
  sent_to_fedapay:  { label: 'En cours',    color: '#1d4ed8', bg: '#dbe4ff' },
  processing:       { label: 'En cours',    color: '#1d4ed8', bg: '#dbe4ff' },
  sent:             { label: 'Envoyé',      color: '#15803d', bg: '#dcfce7' },
  failed:           { label: 'Échoué',      color: '#b91c1c', bg: '#fee2e2' },
  rejected:         { label: 'Refusé',      color: '#b91c1c', bg: '#fee2e2' },
  cancelled:        { label: 'Annulé',      color: '#525252', bg: '#f3f4f6' },
}

function maskPhone(phone: string): string {
  // Ex. "+22996123445" → "+229 ** ** ** 45"
  const m = phone.match(/^(\+\d{1,4})(\d+)$/)
  if (!m) return phone
  const prefix = m[1]
  const rest = m[2]
  const last2 = rest.slice(-2)
  const masked = '** '.repeat(Math.max(0, Math.floor((rest.length - 2) / 2))).trim()
  return `${prefix} ${masked} ${last2}`.replace(/\s+/g, ' ').trim()
}

function formatAmount(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n)
}

export default function WithdrawalsClient({
  initialBalance,
  initialWithdrawals,
  profileDefaults,
}: {
  initialBalance: number
  initialWithdrawals: Withdrawal[]
  profileDefaults: { name: string; phone: string; country: string }
}) {
  const [balance, setBalance] = useState(initialBalance)
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>(initialWithdrawals)
  const [modalOpen, setModalOpen] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const hasTodayPending = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return withdrawals.some(w =>
      w.created_at.slice(0, 10) === today &&
      !['failed','rejected','cancelled'].includes(w.status))
  }, [withdrawals])

  const canRequest = balance >= 500 && !hasTodayPending

  const handleRefresh = async () => {
    const r1 = await fetch('/api/withdrawals/balance').then(r => r.json())
    setBalance(r1.balance ?? 0)
    const r2 = await fetch('/api/withdrawals?pageSize=50').then(r => r.json())
    setWithdrawals(r2.withdrawals ?? [])
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Annuler cette demande ?')) return
    setCancellingId(id)
    const r = await fetch(`/api/withdrawals/${id}/cancel`, { method: 'POST' })
    setCancellingId(null)
    if (!r.ok) {
      const e = await r.json().catch(() => ({}))
      alert(e.error ?? 'Erreur')
      return
    }
    await handleRefresh()
  }

  return (
    <div style={{ width:'100%', margin: '0 auto', padding: '32px 24px' }}>
      {/* Bandeau solde */}
      <div style={{
        background:'#fff', border:'1px solid var(--color-border)', borderRadius:16,
        padding:'24px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24,
      }}>
        <div>
          <p style={{ fontSize:13, color:'var(--color-text-muted)', marginBottom:4 }}>Solde retirable</p>
          <h1 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:36 }}>
            {formatAmount(balance)} <span style={{ fontSize:18, color:'var(--color-text-muted)' }}>XOF</span>
          </h1>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          disabled={!canRequest}
          style={{
            padding:'12px 20px', borderRadius:10, border:'none',
            background: canRequest ? 'var(--color-accent)' : 'var(--color-surface)',
            color: canRequest ? '#fff' : 'var(--color-text-muted)',
            fontWeight:600, fontSize:14, cursor: canRequest ? 'pointer' : 'not-allowed',
          }}
        >
          Demander un retrait
        </button>
      </div>
      {hasTodayPending && (
        <p style={{ fontSize:12, color:'var(--color-text-muted)', marginBottom:16 }}>
          Tu as déjà fait une demande aujourd&apos;hui. Reviens demain.
        </p>
      )}

      {/* Grille tarifaire */}
      <FeesGrid />

      {/* Tableau historique */}
      {withdrawals.length === 0 ? (
        <div style={{ textAlign:'center', padding:'80px 24px', color:'var(--color-text-muted)' }}>
          Demande ton premier retrait dès que ton solde dépasse 500 XOF.
        </div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid var(--color-border)', borderRadius:14, overflow:'hidden' }}>
          {withdrawals.map(w => (
            <div key={w.id} style={{
              padding:'14px 18px', display:'grid',
              gridTemplateColumns:'1fr 1fr 1.3fr 0.8fr 1fr 0.6fr',
              alignItems:'center', borderTop:'1px solid var(--color-border)', gap:12,
            }}>
              <span style={{ fontSize:13, color:'var(--color-text-muted)' }}>
                {new Date(w.created_at).toLocaleDateString('fr-FR')}
              </span>
              <span style={{ fontSize:14, fontWeight:600 }}>{formatAmount(w.amount)} XOF</span>
              <span style={{ fontSize:13 }}>{maskPhone(w.receiver_phone)}</span>
              <span style={{ fontSize:13, textTransform:'uppercase' }}>{w.receiver_provider}</span>
              <span style={{
                fontSize:12, fontWeight:600, padding:'4px 10px', borderRadius:999,
                background: STATUS_LABEL[w.status].bg, color: STATUS_LABEL[w.status].color,
                justifySelf:'start',
              }}>{STATUS_LABEL[w.status].label}</span>
              <div style={{ justifySelf:'end' }}>
                {w.status === 'pending_review' && (
                  <button
                    onClick={() => handleCancel(w.id)}
                    disabled={cancellingId === w.id}
                    style={{
                      padding:'6px 12px', borderRadius:8, border:'1px solid var(--color-border)',
                      background:'#fff', color:'var(--color-text)', fontSize:12, fontWeight:600,
                      cursor: cancellingId === w.id ? 'wait' : 'pointer',
                    }}
                  >
                    {cancellingId === w.id ? '...' : 'Annuler'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <RequestModal
          balance={balance}
          defaults={profileDefaults}
          onClose={() => setModalOpen(false)}
          onSuccess={async () => { setModalOpen(false); await handleRefresh() }}
        />
      )}
    </div>
  )
}

function FeesGrid() {
  const rows = PAYOUT_FEE_TIERS.map((t, i) => {
    const lo = i === 0 ? 0 : (PAYOUT_FEE_TIERS[i - 1].max + 1)
    const hi = Number.isFinite(t.max) ? t.max : null
    return {
      label: hi == null ? `${formatAmount(lo)} et plus` : `${formatAmount(lo)} – ${formatAmount(hi)}`,
      fee: t.fee,
    }
  })

  return (
    <div style={{
      background:'#fff', border:'1px solid var(--color-border)', borderRadius:14,
      padding:'18px 22px', marginBottom:24,
    }}>
      <h3 style={{
        fontFamily:'var(--font-display)', fontWeight:700, fontSize:15,
        marginBottom:4, color:'var(--color-text)',
      }}>
        Frais de retrait FedaPay
      </h3>
      <p style={{ fontSize:12, color:'var(--color-text-muted)', marginBottom:14 }}>
        Forfait identique pour tous les opérateurs (MTN, Moov, T-Money…), variable selon la tranche du montant retiré.
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:'8px 16px', fontSize:13 }}>
        <span style={{ color:'var(--color-text-muted)', fontWeight:600, fontSize:11, textTransform:'uppercase' }}>
          Tranche (XOF)
        </span>
        <span style={{ color:'var(--color-text-muted)', fontWeight:600, fontSize:11, textTransform:'uppercase', textAlign:'right' }}>
          Frais
        </span>
        {rows.map((r) => (
          <Fragment key={r.label}>
            <span>{r.label}</span>
            <span style={{ textAlign:'right', fontWeight:600 }}>{formatAmount(r.fee)} XOF</span>
          </Fragment>
        ))}
      </div>
    </div>
  )
}

function RequestModal({
  balance, defaults, onClose, onSuccess,
}: {
  balance: number
  defaults: { name: string; phone: string; country: string }
  onClose: () => void
  onSuccess: () => Promise<void>
}) {
  const [amount, setAmount] = useState('')
  const [name, setName] = useState(defaults.name)
  const [phone, setPhone] = useState(defaults.phone)
  // Pays/opérateurs supportés par les payouts FedaPay (5 méthodes)
  const supportedCountries = useMemo(
    () => Array.from(new Set(FEDAPAY_PAYOUT_METHODS.map(m => m.countryCode))),
    [],
  )
  const initialCountry = supportedCountries.includes(defaults.country)
    ? defaults.country
    : (supportedCountries[0] ?? 'bj')
  const [country, setCountry] = useState(initialCountry)
  const providersForCountry = useMemo(
    () => FEDAPAY_PAYOUT_METHODS.filter(m => m.countryCode === country),
    [country],
  )
  const [provider, setProvider] = useState(providersForCountry[0]?.providerCode ?? 'mtn')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [submittedAmount, setSubmittedAmount] = useState<number | null>(null)

  const numericAmount = parseInt(amount, 10) || 0
  const setPercent = (p: number) => setAmount(String(Math.floor((balance * p) / 100)))

  const handleSubmit = async () => {
    setError('')
    if (numericAmount < 500) { setError('Montant minimum 500 XOF'); return }
    if (!name.trim() || !phone.trim()) { setError('Coordonnées requises'); return }
    setSubmitting(true)
    const r = await fetch('/api/withdrawals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: numericAmount,
        receiver_name: name.trim(),
        receiver_phone: phone.trim(),
        receiver_country: country,
        receiver_provider: provider,
      }),
    })
    setSubmitting(false)
    if (!r.ok) { const e = await r.json().catch(() => ({})); setError(e.error ?? 'Erreur'); return }
    setSubmittedAmount(numericAmount)
  }

  const handleClose = async () => {
    if (submittedAmount !== null) await onSuccess()
    else onClose()
  }


  if (submittedAmount !== null) {
    return (
      <div onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
        style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex',
                 alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
        <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:440, padding:'32px 24px', textAlign:'center' }}>
          <div style={{
            width:56, height:56, borderRadius:'50%', background:'#dcfce7', color:'#15803d',
            display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16,
          }}>
            <i className="hgi-stroke hgi-checkmark-circle-02" style={{ fontSize:28 }} />
          </div>
          <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:20, marginBottom:8 }}>
            Demande envoyée
          </h2>
          <p style={{ fontSize:14, color:'var(--color-text)', marginBottom:6 }}>
            Ta demande de retrait de <b>{formatAmount(submittedAmount)} XOF</b> est en cours de traitement.
          </p>
          <p style={{ fontSize:13, color:'var(--color-text-muted)', marginBottom:24 }}>
            Le versement sera effectif dans un délai maximum de <b>24 heures</b>.
          </p>
          <button onClick={handleClose} style={{
            padding:'10px 24px', borderRadius:10, border:'none',
            background:'var(--color-accent)', color:'#fff', cursor:'pointer',
            fontSize:13, fontWeight:600,
          }}>Fermer</button>
        </div>
      </div>
    )
  }

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex',
               alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:480, padding:24 }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:18, marginBottom:16 }}>
          Demander un retrait
        </h2>

        <label style={{ fontSize:12, color:'var(--color-text-muted)' }}>Montant (XOF)</label>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
          style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--color-border)',
                   borderRadius:10, fontSize:14, marginTop:4 }} />
        <div style={{ display:'flex', gap:6, marginTop:6 }}>
          {[25, 50, 100].map(p => (
            <button key={p} onClick={() => setPercent(p)} type="button"
              style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--color-border)',
                       background:'#fff', fontSize:11, cursor:'pointer' }}>
              {p}%
            </button>
          ))}
          <span style={{ marginLeft:'auto', fontSize:12, color:'var(--color-text-muted)' }}>
            Solde : {formatAmount(balance)} XOF
          </span>
        </div>

        {numericAmount >= 500 && (
          <p style={{ fontSize:13, marginTop:12, color:'var(--color-text)' }}>
            Tu reçois exactement <b>{formatAmount(numericAmount)} XOF</b>.
          </p>
        )}

        <div style={{ marginTop:18 }}>
          <label style={{ fontSize:12, color:'var(--color-text-muted)' }}>Nom complet</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--color-border)',
                     borderRadius:10, fontSize:14, marginTop:4 }} />
        </div>
        <div style={{ marginTop:10 }}>
          <label style={{ fontSize:12, color:'var(--color-text-muted)' }}>Téléphone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+22996..."
            style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--color-border)',
                     borderRadius:10, fontSize:14, marginTop:4 }} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10 }}>
          <div>
            <label style={{ fontSize:12, color:'var(--color-text-muted)' }}>Pays</label>
            <select
              value={country}
              onChange={(e) => {
                const c = e.target.value
                setCountry(c)
                const first = FEDAPAY_PAYOUT_METHODS.find(m => m.countryCode === c)
                setProvider(first?.providerCode ?? '')
              }}
              style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--color-border)',
                       borderRadius:10, fontSize:14, marginTop:4, background:'#fff' }}>
              {supportedCountries.map(c => (
                <option key={c} value={c}>
                  {FEDAPAY_PAYOUT_METHODS.find(m => m.countryCode === c)?.countryLabel ?? c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize:12, color:'var(--color-text-muted)' }}>Opérateur</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}
              style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--color-border)',
                       borderRadius:10, fontSize:14, marginTop:4, background:'#fff' }}>
              {providersForCountry.map(m => (
                <option key={m.providerCode} value={m.providerCode}>{m.providerLabel}</option>
              ))}
            </select>
          </div>
        </div>

        {numericAmount >= 100000 && (
          <p style={{ fontSize:12, color:'#9a6a00', marginTop:12 }}>
            Pour les retraits ≥ 100 000 XOF, validation manuelle sous 24h.
          </p>
        )}

        {error && <p style={{ color:'var(--color-red)', fontSize:13, marginTop:10 }}>{error}</p>}

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onClose} style={{
            padding:'10px 16px', borderRadius:10, border:'1px solid var(--color-border)',
            background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600,
          }}>Annuler</button>
          <button onClick={handleSubmit} disabled={submitting} style={{
            padding:'10px 16px', borderRadius:10, border:'none',
            background:'var(--color-accent)', color:'#fff', cursor: submitting ? 'wait' : 'pointer',
            fontSize:13, fontWeight:600,
          }}>{submitting ? '...' : 'Confirmer la demande'}</button>
        </div>
      </div>
    </div>
  )
}
