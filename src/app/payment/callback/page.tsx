import { createServerClient } from '@supabase/ssr'
import Link from 'next/link'

const FEDAPAY_SECRET = process.env.FEDAPAY_SECRET_KEY!
const FEDAPAY_ENV = process.env.FEDAPAY_ENVIRONMENT ?? 'sandbox'
const FEDAPAY_BASE =
  FEDAPAY_ENV === 'live'
    ? 'https://api.fedapay.com/v1'
    : 'https://sandbox-api.fedapay.com/v1'

export default async function PaymentCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; status?: string }>
}) {
  const { id, status } = await searchParams

  let verified = false
  let finalStatus = status ?? 'unknown'
  let txDetails: { amount?: number; description?: string } = {}

  if (id) {
    // Vérifier la transaction auprès de FedaPay (ne JAMAIS se fier aux query params seuls)
    try {
      const res = await fetch(`${FEDAPAY_BASE}/transactions/${id}`, {
        headers: {
          Authorization: `Bearer ${FEDAPAY_SECRET}`,
          'Content-Type': 'application/json',
        },
      })

      if (res.ok) {
        const data = await res.json()
        const tx = data.v1?.transaction ?? data
        finalStatus = tx.status ?? finalStatus
        txDetails = { amount: tx.amount, description: tx.description }
        verified = true

        // Mettre à jour le statut dans Supabase
        const supabase = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          { cookies: { getAll: () => [], setAll: () => {} } }
        )

        await supabase
          .from('transactions')
          .update({ status: finalStatus })
          .eq('fedapay_transaction_id', Number(id))
      }
    } catch (err) {
      console.error('Callback verification error:', err)
    }
  }

  const isSuccess = finalStatus === 'approved'
  const isPending = finalStatus === 'pending'
  const isFailed = finalStatus === 'canceled' || finalStatus === 'declined'

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

            {/* Détails */}
            {verified && txDetails.amount && (
              <div
                style={{
                  width: '100%',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  padding: '14px 16px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Montant</span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--color-text)' }}>
                  {new Intl.NumberFormat('fr-FR').format(txDetails.amount)} FCFA
                </span>
              </div>
            )}

            {/* Référence */}
            {id && (
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Réf. transaction : <strong>{id}</strong>
              </p>
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
