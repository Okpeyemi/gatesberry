export default function PaymentPagesPage() {
  return (
    <div style={{ padding: '40px 48px', flex: 1 }}>
      <div style={{ marginBottom: '40px' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
          Dashboard
        </p>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '28px',
            letterSpacing: '-0.02em',
            color: 'var(--color-text)',
          }}
        >
          Pages de paiement
        </h1>
      </div>

      <div
        style={{
          background: '#fff',
          border: '1.5px dashed var(--color-border)',
          borderRadius: '20px',
          padding: '64px 32px',
          textAlign: 'center',
          maxWidth: '480px',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'var(--color-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
          }}
        >
          <i
            className="hgi-stroke hgi-link-square-01"
            style={{ fontSize: '26px', color: 'var(--color-text-muted)' }}
          />
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '20px',
            color: 'var(--color-text)',
            marginBottom: '8px',
          }}
        >
          Bientôt disponible
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: 1.65 }}>
          Créez et gérez vos pages de paiement personnalisées. Vos clients pourront payer en quelques clics.
        </p>
      </div>
    </div>
  )
}
