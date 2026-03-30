"use client"

import { useState } from 'react'
import Link from 'next/link'

export interface PayProduct {
  id: string
  name: string
  description: string | null
  price: number
  billing_cycle: string
}

const CYCLE: Record<string, { label: string; color: string; bg: string; renewable: boolean }> = {
  one_time: { label: 'Usage unique', color: 'var(--color-purple)', bg: 'var(--color-purple-light)', renewable: false },
  monthly:  { label: 'Mensuel',      color: 'var(--color-blue)',   bg: 'var(--color-blue-light)',   renewable: true  },
  yearly:   { label: 'Annuel',        color: 'var(--color-amber)',  bg: 'var(--color-amber-light)',  renewable: true  },
}

const formatPrice = (price: number) =>
  `${new Intl.NumberFormat('fr-FR').format(price)} FCFA`

export default function PayPageClient({
  title,
  description,
  products,
}: {
  title: string
  description: string | null
  products: PayProduct[]
}) {
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? '')
  const [isSelectOpen, setIsSelectOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [autoRenew, setAutoRenew] = useState(false)

  const selected = products.find((p) => p.id === selectedId) ?? products[0]
  const cycle = selected ? (CYCLE[selected.billing_cycle] ?? CYCLE.one_time) : null
  const multipleProducts = products.length > 1

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '440px' }} className="anim-fade-up">

        {/* Logo */}
        <Link href="/" className="logo" style={{ display: 'inline-flex', marginBottom: '36px' }}>
          Gatesberry<span className="logo-dot" />
        </Link>

        {/* Card */}
        <div
          style={{
            background: '#fff',
            border: '1px solid var(--color-border)',
            borderRadius: '24px',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(26,22,20,0.06)',
          }}
        >
          {/* Accent bar */}
          <div style={{ height: '4px', background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-glow))' }} />

          <div style={{ padding: '28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Titre de la page */}
            <div>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '22px',
                  letterSpacing: '-0.02em',
                  color: 'var(--color-text)',
                  marginBottom: description ? '6px' : 0,
                }}
              >
                {title}
              </h1>
              {description && (
                <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                  {description}
                </p>
              )}
            </div>

            {/* ── Choix du plan (custom select — style Pricing simulator) ── */}
            {multipleProducts && (
              <div>
                <label
                  style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '8px' }}
                >
                  Choisissez votre plan
                </label>
                <div style={{ position: 'relative' }}>
                  <div
                    className={`custom-select ${isSelectOpen ? 'open' : ''}`}
                    onClick={() => setIsSelectOpen(!isSelectOpen)}
                  >
                    <span>
                      {selected?.name} —{' '}
                      <strong style={{ color: 'var(--color-green)' }}>{selected ? formatPrice(selected.price) : ''}</strong>
                    </span>
                    <i className={`hgi-stroke hgi-arrow-down-01 select-arrow ${isSelectOpen ? 'open' : ''}`} />
                  </div>

                  {isSelectOpen && (
                    <>
                      <div className="custom-select-backdrop" onClick={() => setIsSelectOpen(false)} />
                      <div className="custom-select-menu">
                        {products.map((p) => {
                          const c = CYCLE[p.billing_cycle] ?? CYCLE.one_time
                          return (
                            <div
                              key={p.id}
                              className={`custom-select-option ${p.id === selectedId ? 'selected' : ''}`}
                              onClick={() => { setSelectedId(p.id); setIsSelectOpen(false) }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span className="opt-country">{p.name}</span>
                                <span
                                  style={{
                                    marginLeft: '8px',
                                    fontSize: '11px',
                                    fontWeight: 600,
                                    padding: '2px 7px',
                                    borderRadius: '100px',
                                    background: p.id === selectedId ? 'rgba(255,255,255,0.2)' : c.bg,
                                    color: p.id === selectedId ? '#fff' : c.color,
                                  }}
                                >
                                  {c.label}
                                </span>
                              </div>
                              <span className="opt-details">{formatPrice(p.price)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Détail du produit sélectionné ── */}
            {selected && (
              <div
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '14px',
                  padding: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: selected.description ? '8px' : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fff', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="hgi-stroke hgi-package-01" style={{ fontSize: '16px', color: 'var(--color-accent)' }} />
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>{selected.name}</span>
                    {cycle && (
                      <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '100px', background: cycle.bg, color: cycle.color }}>
                        {cycle.label}
                      </span>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '18px', color: 'var(--color-text)', flexShrink: 0 }}>
                    {formatPrice(selected.price)}
                  </span>
                </div>
                {selected.description && (
                  <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: 1.55, paddingLeft: '40px' }}>
                    {selected.description}
                  </p>
                )}
              </div>
            )}

            {/* ── Numéro de téléphone ── */}
            <div>
              <label
                style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}
              >
                Numéro mobile money <span style={{ color: 'var(--color-accent)' }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <i
                  className="hgi-stroke hgi-smart-phone-01"
                  style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', color: 'var(--color-text-muted)', pointerEvents: 'none' }}
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+229 97 00 00 00"
                  style={{
                    width: '100%',
                    padding: '13px 14px 13px 44px',
                    border: '1.5px solid var(--color-border)',
                    borderRadius: '10px',
                    fontSize: '15px',
                    fontFamily: 'var(--font-body)',
                    color: 'var(--color-text)',
                    background: '#fff',
                    outline: 'none',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
                  onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
                />
              </div>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                Le montant sera prélevé sur ce numéro à la confirmation.
              </p>
            </div>

            {/* ── Rappels de renouvellement (monthly / yearly uniquement) ── */}
            {cycle?.renewable && (
              <div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    cursor: 'pointer',
                    padding: '14px',
                    borderRadius: '12px',
                    border: `1.5px solid ${autoRenew ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: autoRenew ? 'var(--color-surface)' : '#fff',
                    transition: 'all 0.2s',
                  }}
                >
                  {/* Custom checkbox */}
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '5px',
                      flexShrink: 0,
                      marginTop: '1px',
                      border: autoRenew ? 'none' : '1.5px solid var(--color-border)',
                      background: autoRenew ? 'var(--color-accent)' : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}
                    onClick={() => setAutoRenew(!autoRenew)}
                  >
                    {autoRenew && <i className="hgi-stroke hgi-checkmark-01" style={{ fontSize: '12px', color: '#fff' }} />}
                  </div>
                  <div onClick={() => setAutoRenew(!autoRenew)}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '2px' }}>
                      Rappels de renouvellement
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                      Recevoir un message WhatsApp avec mon lien de paiement à la date d'échéance.
                    </p>
                  </div>
                </label>

                {autoRenew && (
                  <div
                    style={{
                      marginTop: '8px',
                      padding: '12px 14px',
                      background: 'var(--color-blue-light)',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                    }}
                  >
                    <i className="hgi-stroke hgi-information-circle" style={{ fontSize: '15px', color: 'var(--color-blue)', flexShrink: 0, marginTop: '1px' }} />
                    <p style={{ fontSize: '12px', color: 'var(--color-blue)', lineHeight: 1.6 }}>
                      <strong>Ce n'est pas un prélèvement automatique.</strong> Vous garderez le contrôle total — nous vous enverrons simplement un rappel WhatsApp avec votre lien de paiement à la date d'échéance {selected.billing_cycle === 'monthly' ? 'mensuelle' : 'annuelle'}.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Bouton paiement (placeholder) ── */}
            <button
              disabled
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '14px 24px',
                background: 'var(--color-accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 600,
                fontFamily: 'var(--font-body)',
                cursor: 'not-allowed',
                opacity: 0.7,
              }}
            >
              <i className="hgi-stroke hgi-smart-phone-01" style={{ fontSize: '18px' }} />
              Payer {selected ? formatPrice(selected.price) : ''}
              <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.25)', padding: '2px 8px', borderRadius: '100px' }}>
                Bientôt
              </span>
            </button>

            {/* Sécurité */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <i className="hgi-stroke hgi-shield-check" style={{ fontSize: '14px', color: 'var(--color-green)' }} />
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Paiement sécurisé via Gatesberry
              </span>
            </div>

          </div>
        </div>

        {/* Footer */}
        <p style={{ marginTop: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-muted)' }}>
          Propulsé par{' '}
          <Link href="/" style={{ color: 'var(--color-accent)', textDecoration: 'none', fontWeight: 600 }}>
            Gatesberry
          </Link>
        </p>

      </div>
    </div>
  )
}
