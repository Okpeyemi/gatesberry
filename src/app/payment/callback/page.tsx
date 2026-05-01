import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function PaymentCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; status?: string; receipt?: string }>
}) {
  const { id, status, receipt } = await searchParams
  const finalStatus = status ?? 'unknown'

  const isSuccess = finalStatus === 'approved'
  const isPending = finalStatus === 'pending'

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
          <div
            style={{
              height: '4px',
              background: isSuccess
                ? 'var(--color-green)'
                : isPending
                  ? 'var(--color-amber)'
                  : '#DC2626',
            }}
          />

          <div
            style={{
              padding: '40px 28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '16px',
              textAlign: 'center',
            }}
          >
            {/* Icone */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isSuccess
                  ? 'var(--color-green-light, #ECFDF5)'
                  : isPending
                    ? 'var(--color-amber-light, #FFFBEB)'
                    : '#FEF2F2',
              }}
            >
              <i
                className={`hgi-stroke ${isSuccess ? 'hgi-checkmark-circle-02' : isPending ? 'hgi-time-quarter-02' : 'hgi-cancel-circle'}`}
                style={{
                  fontSize: '32px',
                  color: isSuccess
                    ? 'var(--color-green)'
                    : isPending
                      ? 'var(--color-amber, #F59E0B)'
                      : '#DC2626',
                }}
              />
            </div>

            {/* Titre */}
            <h1
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                fontSize: '22px',
                letterSpacing: '-0.02em',
                color: 'var(--color-text)',
              }}
            >
              {isSuccess
                ? 'Paiement réussi !'
                : isPending
                  ? 'Paiement en cours…'
                  : 'Paiement échoué'}
            </h1>

            {/* Description */}
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: 1.6, maxWidth: '340px' }}>
              {isSuccess
                ? 'Votre paiement a été confirmé avec succès. Merci pour votre confiance !'
                : isPending
                  ? 'Votre paiement est en cours de traitement. Vous recevrez une confirmation dès qu\'il sera validé.'
                  : 'Le paiement n\'a pas abouti. Veuillez réessayer ou contacter le marchand.'}
            </p>

            {/* Référence */}
            {id && (
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Réf. transaction : <strong>{id}</strong>
              </p>
            )}

            {/* Bouton télécharger le reçu */}
            {isSuccess && receipt && (
              <a
                href={receipt}
                download={`recu-${id}.pdf`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginTop: '8px',
                  padding: '10px 20px',
                  borderRadius: '12px',
                  background: 'var(--color-accent)',
                  color: '#fff',
                  fontSize: '14px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-body)',
                  textDecoration: 'none',
                  transition: 'opacity 0.15s',
                }}
              >
                <i className="hgi-stroke hgi-download-04" style={{ fontSize: '16px' }} />
                Télécharger le reçu
              </a>
            )}
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
