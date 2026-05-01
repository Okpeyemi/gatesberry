"use client"

import { useState } from 'react'
import Link from 'next/link'

interface Transaction {
  id: string
  amount: number
  status: string
  customer_phone: string
  customer_firstname: string | null
  customer_lastname: string | null
  created_at: string
  products: { name: string } | null
  payment_pages: { title: string; slug: string } | null
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  approved:    { label: 'Approuvé',  color: 'var(--color-green)',  bg: 'var(--color-green-light, #ECFDF5)' },
  pending:     { label: 'En attente', color: 'var(--color-amber, #F59E0B)', bg: 'var(--color-amber-light, #FFFBEB)' },
  canceled:    { label: 'Annulé',    color: '#DC2626',             bg: '#FEF2F2' },
  declined:    { label: 'Refusé',    color: '#DC2626',             bg: '#FEF2F2' },
  transferred: { label: 'Transféré', color: 'var(--color-blue)',   bg: 'var(--color-blue-light)' },
  refunded:    { label: 'Remboursé', color: 'var(--color-purple)', bg: 'var(--color-purple-light)' },
  expired:     { label: 'Expiré',    color: 'var(--color-text-muted)', bg: 'var(--color-surface)' },
}

const formatPrice = (price: number) =>
  `${new Intl.NumberFormat('fr-FR').format(price)} F`

const formatDate = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const formatTime = (iso: string) => {
  const d = new Date(iso)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

const PAGE_SIZE = 5

type FilterStatus = 'all' | 'approved' | 'pending' | 'canceled'

export default function DashboardHomeClient({
  firstName,
  transactions,
}: {
  firstName: string
  transactions: Transaction[]
}) {
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [page, setPage] = useState(0)

  const filtered = filter === 'all'
    ? transactions
    : transactions.filter((t) => {
        if (filter === 'canceled') return t.status === 'canceled' || t.status === 'declined'
        return t.status === filter
      })

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Stats
  const totalApproved = transactions
    .filter((t) => t.status === 'approved' || t.status === 'transferred')
    .reduce((sum, t) => sum + t.amount, 0)
  const countApproved = transactions.filter((t) => t.status === 'approved' || t.status === 'transferred').length
  const countPending = transactions.filter((t) => t.status === 'pending').length
  const countTotal = transactions.length

  const stats = [
    { label: 'Revenus nets', value: `${formatPrice(totalApproved)}`, icon: 'hgi-money-bag-01', color: 'var(--color-green)', bg: 'var(--color-green-light, #ECFDF5)' },
    { label: 'Transactions', value: String(countTotal), icon: 'hgi-arrow-turn-backward', color: 'var(--color-blue)', bg: 'var(--color-blue-light)' },
    { label: 'Réussies', value: String(countApproved), icon: 'hgi-checkmark-circle-02', color: 'var(--color-green)', bg: 'var(--color-green-light, #ECFDF5)' },
    { label: 'En attente', value: String(countPending), icon: 'hgi-clock-01', color: 'var(--color-amber, #F59E0B)', bg: 'var(--color-amber-light, #FFFBEB)' },
  ]

  const filters: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'Toutes' },
    { key: 'approved', label: 'Réussies' },
    { key: 'pending', label: 'En attente' },
    { key: 'canceled', label: 'Échouées' },
  ]

  return (
    <div style={{ padding: '40px 48px', flex: 1 }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
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
          Bonjour, {firstName}
        </h1>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '32px' }}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: '#fff',
              border: '1px solid var(--color-border)',
              borderRadius: '16px',
              padding: '20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px',
            }}
          >
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: s.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <i className={`hgi-stroke ${s.icon}`} style={{ fontSize: '18px', color: s.color }} />
            </div>
            <div>
              <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>{s.label}</p>
              <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '20px', color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
                {s.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Transactions */}
      <div
        style={{
          background: '#fff',
          border: '1px solid var(--color-border)',
          borderRadius: '20px',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '18px',
              color: 'var(--color-text)',
            }}
          >
            Transactions récentes
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {/* Filter pills */}
            <div style={{ display: 'flex', gap: '6px' }}>
              {filters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => { setFilter(f.key); setPage(0) }}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '100px',
                    border: filter === f.key ? 'none' : '1px solid var(--color-border)',
                    background: filter === f.key ? 'var(--color-accent)' : '#fff',
                    color: filter === f.key ? '#fff' : 'var(--color-text-muted)',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: 'var(--font-body)',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <Link
              href="/dashboard/transactions"
              style={{
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-accent)',
                textDecoration: 'none',
              }}
            >
              Voir tout <i className="hgi-stroke hgi-arrow-right-01" style={{ fontSize: '12px' }} />
            </Link>
          </div>
        </div>

        {/* List */}
        {paginated.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <i className="hgi-stroke hgi-inbox" style={{ fontSize: '32px', color: 'var(--color-text-muted)', marginBottom: '12px', display: 'block' }} />
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>
              {countTotal === 0 ? 'Aucune transaction pour le moment.' : 'Aucune transaction avec ce filtre.'}
            </p>
          </div>
        ) : (
          <div>
            {paginated.map((tx, idx) => {
              const st = STATUS_MAP[tx.status] ?? STATUS_MAP.pending
              const customerName = [tx.customer_firstname, tx.customer_lastname].filter(Boolean).join(' ') || tx.customer_phone
              return (
                <div
                  key={tx.id}
                  style={{
                    padding: '16px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    borderBottom: idx < paginated.length - 1 ? '1px solid var(--color-border)' : 'none',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fff' }}
                >
                  {/* Avatar initiales */}
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      fontFamily: 'var(--font-display)',
                      fontWeight: 700,
                      fontSize: '13px',
                      color: 'var(--color-text-muted)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {(tx.customer_firstname?.[0] ?? '') + (tx.customer_lastname?.[0] ?? '')}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
                        {customerName}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '100px',
                          background: st.bg,
                          color: st.color,
                          flexShrink: 0,
                        }}
                      >
                        {st.label}
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {tx.products?.name ?? '—'} · {tx.payment_pages?.title ?? '—'}
                    </p>
                  </div>

                  {/* Montant + date */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--color-text)', marginBottom: '2px' }}>
                      {formatPrice(tx.amount)}
                    </p>
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {formatDate(tx.created_at)} · {formatTime(tx.created_at)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div
            style={{
              padding: '12px 24px',
              borderTop: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
              Page {page + 1} sur {totalPages}
            </p>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: '#fff',
                  color: page === 0 ? 'var(--color-text-muted)' : 'var(--color-text)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: page === 0 ? 'default' : 'pointer',
                  opacity: page === 0 ? 0.5 : 1,
                  fontFamily: 'var(--font-body)',
                }}
              >
                Précédent
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: '#fff',
                  color: page >= totalPages - 1 ? 'var(--color-text-muted)' : 'var(--color-text)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: page >= totalPages - 1 ? 'default' : 'pointer',
                  opacity: page >= totalPages - 1 ? 0.5 : 1,
                  fontFamily: 'var(--font-body)',
                }}
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
