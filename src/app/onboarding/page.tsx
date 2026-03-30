"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

const OPERATORS = [
  { value: 'mtn', label: 'MTN MoMo', flag: '🟡' },
  { value: 'moov', label: 'Moov Money', flag: '🔵' },
  { value: 'orange', label: 'Orange Money', flag: '🟠' },
  { value: 'wave', label: 'Wave', flag: '🌊' },
]

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [userName, setUserName] = useState('')
  const [operator, setOperator] = useState('mtn')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.full_name) {
        setUserName(user.user_metadata.full_name.split(' ')[0])
      }
    })
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const cleaned = phone.replace(/\s/g, '')
    if (cleaned.length < 8) {
      setError('Veuillez entrer un numéro valide.')
      return
    }

    setLoading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: user.user_metadata?.full_name ?? null,
        mobile_money_number: cleaned,
        mobile_money_operator: operator,
        is_onboarded: true,
        updated_at: new Date().toISOString(),
      })

    if (upsertError) {
      setError(upsertError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        padding: '24px',
      }}
    >
      <div className="anim-fade-up" style={{ width: '100%', maxWidth: '440px' }}>

        {/* Logo */}
        <Link href="/" className="logo" style={{ display: 'inline-flex', marginBottom: '40px' }}>
          Gatesberry<span className="logo-dot" />
        </Link>

        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              background: 'var(--color-green-light)',
              color: 'var(--color-green)',
              fontSize: '13px',
              fontWeight: 600,
              padding: '6px 14px',
              borderRadius: '100px',
              marginBottom: '16px',
            }}
          >
            <i className="hgi-stroke hgi-checkmark-circle-01" style={{ fontSize: '14px' }} />
            Compte créé avec succès
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '28px',
              letterSpacing: '-0.02em',
              marginBottom: '8px',
              color: 'var(--color-text)',
            }}
          >
            {userName ? `Bienvenue, ${userName} !` : 'Dernière étape'}
          </h1>
          <p style={{ fontSize: '15px', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            Renseignez votre numéro mobile money. C'est sur ce compte que vous recevrez vos paiements.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {/* Operator select */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: '8px',
              }}
            >
              Opérateur
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
              {OPERATORS.map((op) => (
                <button
                  key={op.value}
                  type="button"
                  onClick={() => setOperator(op.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: operator === op.value
                      ? '2px solid var(--color-accent)'
                      : '1.5px solid var(--color-border)',
                    background: operator === op.value ? 'var(--color-surface)' : '#fff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: operator === op.value ? 600 : 400,
                    color: operator === op.value ? 'var(--color-accent)' : 'var(--color-text)',
                    fontFamily: 'var(--font-body)',
                    transition: 'all 0.2s',
                  }}
                >
                  <span style={{ fontSize: '18px' }}>{op.flag}</span>
                  {op.label}
                </button>
              ))}
            </div>
          </div>

          {/* Phone input */}
          <div style={{ marginBottom: '24px' }}>
            <label
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--color-text)',
                marginBottom: '8px',
              }}
            >
              Numéro mobile money
            </label>
            <div style={{ position: 'relative' }}>
              <i
                className="hgi-stroke hgi-smart-phone-01"
                style={{
                  position: 'absolute',
                  left: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '18px',
                  color: 'var(--color-text-muted)',
                  pointerEvents: 'none',
                }}
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+229 97 00 00 00"
                required
                style={{
                  width: '100%',
                  padding: '14px 14px 14px 44px',
                  border: '1.5px solid var(--color-border)',
                  borderRadius: '12px',
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
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                marginBottom: '16px',
                padding: '12px 14px',
                background: 'var(--color-red-light)',
                borderRadius: '10px',
                fontSize: '13px',
                color: 'var(--color-red)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="hgi-stroke hgi-alert-circle" style={{ fontSize: '16px', flexShrink: 0 }} />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '14px 24px',
              background: loading ? 'var(--color-text-muted)' : 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseEnter={(e) => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-accent-dark)'
            }}
            onMouseLeave={(e) => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-accent)'
            }}
          >
            {loading ? (
              <>
                <i className="hgi-stroke hgi-loading-01" style={{ fontSize: '18px', animation: 'spin 1s linear infinite' }} />
                Enregistrement…
              </>
            ) : (
              <>
                Accéder à mon dashboard
                <i className="hgi-stroke hgi-arrow-right-01" style={{ fontSize: '18px' }} />
              </>
            )}
          </button>
        </form>

        {/* Info */}
        <div
          style={{
            marginTop: '20px',
            padding: '12px 14px',
            background: 'var(--color-amber-light)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
          }}
        >
          <i
            className="hgi-stroke hgi-information-circle"
            style={{ fontSize: '16px', color: 'var(--color-amber)', flexShrink: 0, marginTop: '1px' }}
          />
          <p style={{ fontSize: '13px', color: 'var(--color-amber)', lineHeight: 1.55 }}>
            Vous pourrez modifier ce numéro à tout moment depuis vos paramètres.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
