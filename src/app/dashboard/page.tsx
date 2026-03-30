import { createClient } from '@/utils/supabase/server'

export default async function DashboardHomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const firstName = (user?.user_metadata?.full_name as string | undefined)
    ?.split(' ')[0] ?? 'Marchand'

  return (
    <div style={{ padding: '40px 48px', flex: 1 }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
          Tableau de bord
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
          Bonjour, {firstName} 👋
        </h1>
      </div>

      {/* Placeholder */}
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
            className="hgi-stroke hgi-dashboard-square-01"
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
          Votre espace marchand arrive
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: 1.65 }}>
          Les statistiques, transactions et aperçus de vos pages de paiement seront disponibles ici très bientôt.
        </p>
      </div>
    </div>
  )
}
