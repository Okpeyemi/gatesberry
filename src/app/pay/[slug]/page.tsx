import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'

const formatPrice = (price: number) =>
  `${new Intl.NumberFormat('fr-FR').format(price)} FCFA`

export default async function PublicPayPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: page } = await supabase
    .from('payment_pages')
    .select('id, title, description, is_active, products(name, description, price)')
    .eq('slug', slug)
    .single()

  if (!page || !page.is_active) notFound()

  const product = page.products as { name: string; description: string | null; price: number } | null

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
      <div style={{ width: '100%', maxWidth: '420px' }} className="anim-fade-up">
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
          {/* Header accent */}
          <div style={{ height: '4px', background: 'linear-gradient(90deg, var(--color-accent), var(--color-accent-glow))' }} />

          <div style={{ padding: '28px' }}>
            {/* Titre */}
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '22px',
                letterSpacing: '-0.02em',
                color: 'var(--color-text)',
                marginBottom: '6px',
              }}
            >
              {page.title}
            </h1>
            {page.description && (
              <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: '20px' }}>
                {page.description}
              </p>
            )}

            {/* Produit */}
            {product && (
              <div
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '14px',
                  padding: '16px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: product.description ? '8px' : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fff', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="hgi-stroke hgi-cube-01" style={{ fontSize: '16px', color: 'var(--color-accent)' }} />
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>{product.name}</span>
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      fontSize: '18px',
                      color: 'var(--color-text)',
                    }}
                  >
                    {formatPrice(product.price)}
                  </span>
                </div>
                {product.description && (
                  <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: 1.55, paddingLeft: '40px' }}>
                    {product.description}
                  </p>
                )}
              </div>
            )}

            {/* Bouton paiement (placeholder) */}
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
              Payer via Mobile Money
              <span style={{ fontSize: '11px', background: 'rgba(255,255,255,0.25)', padding: '2px 8px', borderRadius: '100px' }}>
                Bientôt
              </span>
            </button>

            {/* Sécurité */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '14px' }}>
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
