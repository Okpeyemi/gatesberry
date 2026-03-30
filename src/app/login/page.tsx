"use client"

import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  const supabase = createClient()

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="min-h-screen flex bg-bg">

      {/* ── Form ── */}
      <div className="flex-1 flex flex-col items-center justify-center p-6">

        <Link href="/" className="logo mb-10">
          Gatesberry<span className="logo-dot" />
        </Link>

        <div className="w-full max-w-sm anim-fade-up">

          <div style={{ marginBottom: '32px', textAlign: 'center' }}>
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '30px',
                letterSpacing: '-0.02em',
                marginBottom: '8px',
                color: 'var(--color-text)',
              }}
            >
              Connexion
            </h1>
            <p style={{ fontSize: '15px', color: 'var(--color-text-muted)' }}>
              Accédez à votre espace marchand.
            </p>
          </div>

          {/* Google button */}
          <button
            onClick={handleGoogleLogin}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '14px 24px',
              background: '#fff',
              border: '1.5px solid var(--color-border)',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              color: 'var(--color-text)',
              cursor: 'pointer',
              transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: '0 1px 3px rgba(26,22,20,0.06)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(26,22,20,0.25)'
              ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(26,22,20,0.08)'
              ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)'
              ;(e.currentTarget as HTMLButtonElement).style.boxShadow = '0 1px 3px rgba(26,22,20,0.06)'
              ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
            }}
          >
            {/* Google SVG logo */}
            <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="none" d="M0 0h48v48H0z"/>
            </svg>
            Continuer avec Google
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '28px 0' }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
              D'autres méthodes arrivent bientôt
            </span>
            <div style={{ flex: 1, height: '1px', background: 'var(--color-border)' }} />
          </div>

          {/* Coming soon pills */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              { icon: 'hgi-mail-01', label: 'Email & mot de passe' },
              { icon: 'hgi-smart-phone-01', label: 'OTP téléphone' },
            ].map(({ icon, label }) => (
              <span
                key={label}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '7px 14px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '100px',
                  fontSize: '13px', color: 'var(--color-text-muted)',
                  opacity: 0.7,
                }}
              >
                <i className={`hgi-stroke ${icon}`} style={{ fontSize: '14px' }} />
                {label}
              </span>
            ))}
          </div>

          {/* Security note */}
          <div
            style={{
              marginTop: '32px',
              padding: '14px 16px',
              background: 'var(--color-green-light)',
              borderRadius: '10px',
              display: 'flex', alignItems: 'flex-start', gap: '10px',
            }}
          >
            <i className="hgi-stroke hgi-shield-check" style={{ fontSize: '18px', color: 'var(--color-green)', flexShrink: 0, marginTop: '1px' }} />
            <p style={{ fontSize: '13px', color: 'var(--color-green)', lineHeight: 1.55 }}>
              Connexion sécurisée via Google OAuth. Nous ne stockons jamais votre mot de passe.
            </p>
          </div>

          {/* Terms */}
          <p style={{ marginTop: '28px', fontSize: '12px', color: 'var(--color-text-muted)', lineHeight: 1.6, textAlign: 'center' }}>
            En vous connectant, vous acceptez nos{' '}
            <Link href="/terms" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>
              Conditions d'utilisation
            </Link>
            {' '}et notre{' '}
            <Link href="/privacy" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>
              Politique de confidentialité
            </Link>.
          </p>
        </div>
      </div>
    </div>
  )
}
