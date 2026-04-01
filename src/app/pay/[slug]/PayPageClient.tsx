"use client"

import { useState } from 'react'
import Link from 'next/link'
import Script from 'next/script'

/* ── Types ─────────────────────────────────────────────────── */

export interface PayProduct {
  id: string
  name: string
  description: string | null
  price: number
  billing_cycle: string
}

interface Provider {
  id: string
  name: string
  color: string
  textColor: string
}

interface Country {
  code: string
  name: string
  flag: string
  prefix: string
  providers: Provider[]
}

/* ── Données pays / réseaux ────────────────────────────────── */

const COUNTRIES: Country[] = [
  {
    code: 'bj', name: 'Bénin', flag: '🇧🇯', prefix: '+229',
    providers: [
      { id: 'mtn',     name: 'MTN',     color: '#FFCB05', textColor: '#1A1610' },
      { id: 'moov',    name: 'Moov',    color: '#0066B3', textColor: '#fff' },
      { id: 'celtiis', name: 'Celtiis', color: '#E30613', textColor: '#fff' },
    ],
  },
  {
    code: 'ci', name: 'Côte d\'Ivoire', flag: '🇨🇮', prefix: '+225',
    providers: [
      { id: 'wave',   name: 'Wave',         color: '#1DC7EA', textColor: '#fff' },
      { id: 'mtn',    name: 'MTN',          color: '#FFCB05', textColor: '#1A1610' },
      { id: 'orange', name: 'Orange Money', color: '#FF6600', textColor: '#fff' },
    ],
  },
  {
    code: 'sn', name: 'Sénégal', flag: '🇸🇳', prefix: '+221',
    providers: [
      { id: 'wave',   name: 'Wave',         color: '#1DC7EA', textColor: '#fff' },
      { id: 'orange', name: 'Orange Money', color: '#FF6600', textColor: '#fff' },
      { id: 'mixx',   name: 'Mixx by Yas',  color: '#8B5CF6', textColor: '#fff' },
    ],
  },
  {
    code: 'tg', name: 'Togo', flag: '🇹🇬', prefix: '+228',
    providers: [
      { id: 'moov', name: 'Moov Money', color: '#0066B3', textColor: '#fff' },
      { id: 'mixx', name: 'Mixx by Yas', color: '#8B5CF6', textColor: '#fff' },
    ],
  },
  {
    code: 'ml', name: 'Mali', flag: '🇲🇱', prefix: '+223',
    providers: [
      { id: 'orange', name: 'Orange Money', color: '#FF6600', textColor: '#fff' },
    ],
  },
  {
    code: 'bf', name: 'Burkina-Faso', flag: '🇧🇫', prefix: '+226',
    providers: [
      { id: 'moov',   name: 'Moov',         color: '#0066B3', textColor: '#fff' },
      { id: 'orange', name: 'Orange Money', color: '#FF6600', textColor: '#fff' },
    ],
  },
  {
    code: 'ne', name: 'Niger', flag: '🇳🇪', prefix: '+227',
    providers: [
      { id: 'airtel', name: 'Airtel Money', color: '#ED1C24', textColor: '#fff' },
    ],
  },
]

/* ── Constantes affichage ──────────────────────────────────── */

const CYCLE: Record<string, { label: string; color: string; bg: string; renewable: boolean }> = {
  one_time: { label: 'Usage unique', color: 'var(--color-purple)', bg: 'var(--color-purple-light)', renewable: false },
  monthly:  { label: 'Mensuel',      color: 'var(--color-blue)',   bg: 'var(--color-blue-light)',   renewable: true  },
  yearly:   { label: 'Annuel',        color: 'var(--color-amber)',  bg: 'var(--color-amber-light)',  renewable: true  },
}

const formatPrice = (price: number) =>
  `${new Intl.NumberFormat('fr-FR').format(price)} FCFA`

/* ── Composant ─────────────────────────────────────────────── */

export default function PayPageClient({
  paymentPageId,
  title,
  description,
  products,
}: {
  paymentPageId: string
  title: string
  description: string | null
  products: PayProduct[]
}) {
  // Plan
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? '')
  const [isSelectOpen, setIsSelectOpen] = useState(false)

  // Client
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  // Pays & réseau
  const [countryCode, setCountryCode] = useState('')
  const [isCountryOpen, setIsCountryOpen] = useState(false)
  const [providerId, setProviderId] = useState('')

  // Téléphone
  const [phone, setPhone] = useState('')

  // Renouvellement
  const [autoRenew, setAutoRenew] = useState(false)

  // UI
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [checkoutReady, setCheckoutReady] = useState(false)

  // Derived
  const selected = products.find((p) => p.id === selectedId) ?? products[0]
  const cycle = selected ? (CYCLE[selected.billing_cycle] ?? CYCLE.one_time) : null
  const multipleProducts = products.length > 1
  const country = COUNTRIES.find((c) => c.code === countryCode)
  const providers = country?.providers ?? []

  const canPay =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    countryCode &&
    providerId &&
    phone.replace(/\s+/g, '').length >= 8 &&
    selected &&
    checkoutReady

  // Reset provider + phone quand on change de pays
  function handleCountryChange(code: string) {
    setCountryCode(code)
    setProviderId('')
    setPhone('')
    setIsCountryOpen(false)
  }

  async function handlePay() {
    if (!canPay || loading) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentPageId,
          productId: selected.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          country: countryCode,
          provider: providerId,
          phone: phone.replace(/\s+/g, ''),
          autoRenew,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Une erreur est survenue')
        setLoading(false)
        return
      }

      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setError('Impossible de contacter le serveur')
      setLoading(false)
    }
  }

  return (
    <>
      <Script
        src="https://cdn.fedapay.com/checkout.js?v=1.1.7"
        strategy="afterInteractive"
        onLoad={() => setCheckoutReady(true)}
      />

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

              {/* ── Choix du plan ── */}
              {multipleProducts && (
                <div>
                  <label style={labelStyle}>Choisissez votre plan</label>
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

              {/* ── Nom & Prénom ── */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Prénom <span style={{ color: 'var(--color-accent)' }}>*</span></label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="John"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Nom <span style={{ color: 'var(--color-accent)' }}>*</span></label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                    style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
                    onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
                  />
                </div>
              </div>

              {/* ── Choix du pays ── */}
              <div>
                <label style={labelStyle}>Pays <span style={{ color: 'var(--color-accent)' }}>*</span></label>
                <div style={{ position: 'relative' }}>
                  <div
                    className={`custom-select ${isCountryOpen ? 'open' : ''}`}
                    onClick={() => setIsCountryOpen(!isCountryOpen)}
                  >
                    <span>
                      {country ? (
                        <>{country.flag}&nbsp;&nbsp;{country.name}</>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>Sélectionnez votre pays</span>
                      )}
                    </span>
                    <i className={`hgi-stroke hgi-arrow-down-01 select-arrow ${isCountryOpen ? 'open' : ''}`} />
                  </div>

                  {isCountryOpen && (
                    <>
                      <div className="custom-select-backdrop" onClick={() => setIsCountryOpen(false)} />
                      <div className="custom-select-menu">
                        {COUNTRIES.map((c) => (
                          <div
                            key={c.code}
                            className={`custom-select-option ${c.code === countryCode ? 'selected' : ''}`}
                            onClick={() => handleCountryChange(c.code)}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span className="opt-country">{c.flag}&nbsp;&nbsp;{c.name}</span>
                            </div>
                            <span className="opt-details" style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                              {c.providers.length} réseau{c.providers.length > 1 ? 'x' : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* ── Choix du réseau ── */}
              {country && (
                <div>
                  <label style={labelStyle}>Réseau mobile money <span style={{ color: 'var(--color-accent)' }}>*</span></label>
                  <div style={{ display: 'grid', gridTemplateColumns: providers.length <= 2 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '10px' }}>
                    {providers.map((p) => {
                      const isActive = p.id === providerId
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setProviderId(p.id)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '14px 8px',
                            borderRadius: '12px',
                            border: `1.5px solid ${isActive ? p.color : 'var(--color-border)'}`,
                            background: isActive ? `${p.color}0D` : '#fff',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          {/* Badge logo */}
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '10px',
                              background: p.color,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: isActive ? `0 4px 12px ${p.color}40` : 'none',
                              transition: 'box-shadow 0.2s',
                            }}
                          >
                            <span style={{ fontSize: '13px', fontWeight: 800, color: p.textColor, letterSpacing: '-0.02em' }}>
                              {getProviderAbbr(p.id)}
                            </span>
                          </div>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: isActive ? 'var(--color-text)' : 'var(--color-text-muted)', textAlign: 'center', lineHeight: 1.3 }}>
                            {p.name}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Numéro de téléphone ── */}
              {providerId && country && (
                <div>
                  <label style={labelStyle}>
                    Numéro mobile money <span style={{ color: 'var(--color-accent)' }}>*</span>
                  </label>
                  <div style={{ position: 'relative', display: 'flex', gap: '8px' }}>
                    {/* Préfixe pays */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '0 14px',
                        border: '1.5px solid var(--color-border)',
                        borderRadius: '10px',
                        background: 'var(--color-surface)',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--color-text)',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      <span>{country.flag}</span>
                      <span>{country.prefix}</span>
                    </div>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="97 00 00 00"
                      style={{ ...inputStyle, flex: 1 }}
                      onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
                      onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
                    />
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                    Le montant sera prélevé sur ce numéro à la confirmation.
                  </p>
                </div>
              )}

              {/* ── Rappels de renouvellement ── */}
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

              {/* ── Erreur ── */}
              {error && (
                <div
                  style={{
                    padding: '12px 14px',
                    background: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <i className="hgi-stroke hgi-alert-circle" style={{ fontSize: '15px', color: '#DC2626', flexShrink: 0 }} />
                  <p style={{ fontSize: '13px', color: '#DC2626' }}>{error}</p>
                </div>
              )}

              {/* ── Bouton paiement ── */}
              <button
                onClick={handlePay}
                disabled={!canPay || loading}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '14px 24px',
                  background: canPay && !loading ? 'var(--color-accent)' : '#ccc',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '15px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-body)',
                  cursor: canPay && !loading ? 'pointer' : 'not-allowed',
                  opacity: loading ? 0.7 : 1,
                  transition: 'all 0.2s',
                }}
              >
                {loading ? (
                  <>
                    <span
                      style={{
                        width: '18px',
                        height: '18px',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        animation: 'spin 0.6s linear infinite',
                      }}
                    />
                    Chargement…
                  </>
                ) : (
                  <>
                    <i className="hgi-stroke hgi-smart-phone-01" style={{ fontSize: '18px' }} />
                    Payer {selected ? formatPrice(selected.price) : ''}
                  </>
                )}
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

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </>
  )
}

/* ── Styles partagés ───────────────────────────────────────── */

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--color-text)',
  marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '13px 14px',
  border: '1.5px solid var(--color-border)',
  borderRadius: '10px',
  fontSize: '15px',
  fontFamily: 'var(--font-body)',
  color: 'var(--color-text)',
  background: '#fff',
  outline: 'none',
  transition: 'border-color 0.2s',
}

/* ── Helpers ───────────────────────────────────────────────── */

function getProviderAbbr(id: string): string {
  const map: Record<string, string> = {
    mtn: 'MTN',
    moov: 'Mv',
    celtiis: 'Cel',
    wave: 'Wv',
    orange: 'OM',
    mixx: 'Mx',
    airtel: 'Air',
  }
  return map[id] ?? id.slice(0, 3).toUpperCase()
}
