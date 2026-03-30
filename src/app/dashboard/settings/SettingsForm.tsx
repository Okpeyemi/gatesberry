"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { User } from '@supabase/supabase-js'

const OPERATORS = [
  { value: 'mtn', label: 'MTN MoMo', flag: '🟡' },
  { value: 'moov', label: 'Moov Money', flag: '🔵' },
  { value: 'orange', label: 'Orange Money', flag: '🟠' },
  { value: 'wave', label: 'Wave', flag: '🌊' },
]

interface Profile {
  mobile_money_number: string | null
  mobile_money_operator: string | null
}

export default function SettingsForm({
  user,
  profile,
}: {
  user: User
  profile: Profile | null
}) {
  const supabase = createClient()

  const [operator, setOperator] = useState(profile?.mobile_money_operator ?? 'mtn')
  const [phone, setPhone] = useState(profile?.mobile_money_number ?? '')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('idle')
    setErrorMsg('')

    const cleaned = phone.replace(/\s/g, '')
    if (cleaned.length < 8) {
      setStatus('error')
      setErrorMsg('Veuillez entrer un numéro valide.')
      return
    }

    setLoading(true)

    const { error } = await supabase
      .from('profiles')
      .update({
        mobile_money_number: cleaned,
        mobile_money_operator: operator,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    setLoading(false)

    if (error) {
      setStatus('error')
      setErrorMsg(error.message)
    } else {
      setStatus('success')
    }
  }

  const fullName = (user.user_metadata?.full_name as string | undefined) ?? ''
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined
  const initials = fullName
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  return (
    <div style={{ maxWidth: '560px' }}>

      {/* ── Profil Google (lecture seule) ── */}
      <section style={{ marginBottom: '40px' }}>
        <h2
          style={{
            fontSize: '13px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-text-muted)',
            marginBottom: '16px',
          }}
        >
          Informations du compte
        </h2>

        <div
          style={{
            background: '#fff',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={fullName}
              referrerPolicy="no-referrer"
              style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                background: 'var(--color-accent)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '16px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
          )}
          <div>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)' }}>
              {fullName || 'Nom non disponible'}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
              {user.email}
            </p>
          </div>
          <div
            style={{
              marginLeft: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--color-blue-light)',
              color: 'var(--color-blue)',
              fontSize: '12px',
              fontWeight: 600,
              padding: '5px 12px',
              borderRadius: '100px',
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Google
          </div>
        </div>
      </section>

      {/* ── Mobile Money ── */}
      <section>
        <h2
          style={{
            fontSize: '13px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--color-text-muted)',
            marginBottom: '16px',
          }}
        >
          Compte de réception Mobile Money
        </h2>

        <div
          style={{
            background: '#fff',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            padding: '24px',
          }}
        >
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '20px', lineHeight: 1.6 }}>
            C'est sur ce numéro que vous recevrez vos paiements via Gatesberry.
          </p>

          <form onSubmit={handleSubmit}>
            {/* Operator */}
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
                      padding: '11px 14px',
                      borderRadius: '10px',
                      border: operator === op.value
                        ? '2px solid var(--color-accent)'
                        : '1.5px solid var(--color-border)',
                      background: operator === op.value ? 'var(--color-surface)' : '#fff',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: operator === op.value ? 600 : 400,
                      color: operator === op.value ? 'var(--color-accent)' : 'var(--color-text)',
                      fontFamily: 'var(--font-body)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span>{op.flag}</span>
                    {op.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Phone */}
            <div style={{ marginBottom: '20px' }}>
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
                  onChange={(e) => { setPhone(e.target.value); setStatus('idle') }}
                  placeholder="+229 97 00 00 00"
                  required
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
            </div>

            {/* Feedback */}
            {status === 'success' && (
              <div
                style={{
                  marginBottom: '16px',
                  padding: '12px 14px',
                  background: 'var(--color-green-light)',
                  borderRadius: '10px',
                  fontSize: '13px',
                  color: 'var(--color-green)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <i className="hgi-stroke hgi-checkmark-circle-01" style={{ fontSize: '16px' }} />
                Numéro mis à jour avec succès.
              </div>
            )}
            {status === 'error' && (
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
                <i className="hgi-stroke hgi-alert-circle" style={{ fontSize: '16px' }} />
                {errorMsg}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                background: loading ? 'var(--color-text-muted)' : 'var(--color-accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: 600,
                fontFamily: 'var(--font-body)',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
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
                  <i className="hgi-stroke hgi-loading-01" style={{ fontSize: '16px', animation: 'spin 1s linear infinite' }} />
                  Enregistrement…
                </>
              ) : (
                <>
                  <i className="hgi-stroke hgi-floppy-disk" style={{ fontSize: '16px' }} />
                  Enregistrer les modifications
                </>
              )}
            </button>
          </form>
        </div>
      </section>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
