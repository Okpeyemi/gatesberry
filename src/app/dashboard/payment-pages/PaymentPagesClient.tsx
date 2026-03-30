"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import type { Product, BillingCycle } from '../products/ProductsClient'

// ── Types ──────────────────────────────────────────────────
interface PageProduct {
  product_id: string
  products: Pick<Product, 'id' | 'name' | 'price' | 'billing_cycle'> | null
}

export interface PaymentPage {
  id: string
  title: string
  description: string | null
  slug: string
  is_active: boolean
  created_at: string
  payment_page_products: PageProduct[]
}

const formatPrice = (price: number) =>
  `${new Intl.NumberFormat('fr-FR').format(price)} FCFA`

const makeSlug = (title: string) => {
  const base = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${base}-${Math.random().toString(36).slice(2, 7)}`
}

const CYCLE_LABELS: Record<BillingCycle, string> = {
  one_time: 'Usage unique',
  monthly: 'Mensuel',
  yearly: 'Annuel',
}

// ── Multi-select produits (style custom-select du simulateur) ──
function ProductMultiSelect({
  products,
  selected,
  onChange,
}: {
  products: Product[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  const label =
    selected.length === 0
      ? 'Aucun produit sélectionné'
      : selected.length === 1
      ? (products.find((p) => p.id === selected[0])?.name ?? '1 produit')
      : `${selected.length} produits sélectionnés`

  return (
    <div style={{ position: 'relative' }}>
      <div
        className={`custom-select${open ? ' open' : ''}`}
        onClick={() => setOpen(!open)}
        style={{ minHeight: '48px' }}
      >
        <span style={{ fontSize: '14px', color: selected.length ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
          {label}
        </span>
        <i className={`hgi-stroke hgi-arrow-down-01 select-arrow${open ? ' open' : ''}`} />
      </div>

      {open && (
        <>
          <div className="custom-select-backdrop" onClick={() => setOpen(false)} />
          <div className="custom-select-menu">
            {products.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                Aucun produit disponible.
              </div>
            ) : (
              products.map((p) => {
                const checked = selected.includes(p.id)
                return (
                  <div
                    key={p.id}
                    className={`custom-select-option${checked ? ' selected' : ''}`}
                    onClick={() => toggle(p.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                  >
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0,
                      border: checked ? 'none' : '1.5px solid var(--color-border)',
                      background: checked ? 'rgba(255,255,255,0.3)' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {checked && <i className="hgi-stroke hgi-checkmark-01" style={{ fontSize: '11px', color: '#fff' }} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span className="opt-country">{p.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <span className="opt-details">{formatPrice(p.price)}</span>
                      <span style={{
                        fontSize: '11px', fontWeight: 600, padding: '2px 6px', borderRadius: '100px',
                        background: checked ? 'rgba(255,255,255,0.2)' : 'var(--color-surface)',
                        color: checked ? '#fff' : 'var(--color-text-muted)',
                      }}>
                        {CYCLE_LABELS[p.billing_cycle as BillingCycle] ?? p.billing_cycle}
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Modal ──────────────────────────────────────────────────
function PageModal({
  editing,
  products,
  onClose,
  onSave,
}: {
  editing: PaymentPage | null
  products: Product[]
  onClose: () => void
  onSave: (data: { title: string; description: string; product_ids: string[]; slug: string }) => Promise<string | null>
}) {
  const [title, setTitle] = useState(editing?.title ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    editing?.payment_page_products.map((p) => p.product_id) ?? []
  )
  const [slug, setSlug] = useState(editing?.slug ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleTitleChange = (v: string) => {
    setTitle(v)
    if (!editing) setSlug(makeSlug(v))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!title.trim()) { setError('Le titre est requis.'); return }
    if (!slug.trim()) { setError('Le slug est requis.'); return }
    setSaving(true)
    const err = await onSave({ title: title.trim(), description: description.trim(), product_ids: selectedProductIds, slug: slug.trim() })
    setSaving(false)
    if (err) setError(err)
    else onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    border: '1.5px solid var(--color-border)', borderRadius: '10px',
    fontSize: '14px', fontFamily: 'var(--font-body)',
    color: 'var(--color-text)', background: '#fff',
    outline: 'none', transition: 'border-color 0.2s',
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,22,20,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: '24px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="anim-fade-up" style={{ background: '#fff', borderRadius: '20px', width: '100%', maxWidth: '520px', boxShadow: '0 24px 64px rgba(26,22,20,0.14)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '18px', color: 'var(--color-text)' }}>
            {editing ? 'Modifier la page' : 'Nouvelle page de paiement'}
          </h2>
          <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', background: 'var(--color-surface)', color: 'var(--color-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
            <i className="hgi-stroke hgi-cancel-01" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Titre */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
              Titre <span style={{ color: 'var(--color-accent)' }}>*</span>
            </label>
            <input type="text" value={title} onChange={(e) => handleTitleChange(e.target.value)} placeholder="Ex : Abonnement Premium mensuel" required style={inputStyle} onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')} onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')} />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
              Description <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '6px' }}>optionnel</span>
            </label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ce que reçoit le client après paiement…" rows={2} style={{ ...inputStyle, resize: 'none', lineHeight: 1.6 }} onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')} onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')} />
          </div>

          {/* Produits */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
              Produits proposés <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '6px' }}>optionnel</span>
            </label>
            <ProductMultiSelect products={products} selected={selectedProductIds} onChange={setSelectedProductIds} />
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '5px' }}>
              Le client pourra choisir parmi les produits sélectionnés.
            </p>
          </div>

          {/* Slug */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
              Lien unique <span style={{ color: 'var(--color-accent)' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>/pay/</span>
              <input type="text" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="abonnement-premium-xxxxx" required style={{ ...inputStyle, paddingLeft: '46px' }} onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')} onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')} />
            </div>
            <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Généré automatiquement. Modifiable — doit être unique.</p>
          </div>

          {error && (
            <div style={{ padding: '11px 14px', background: 'var(--color-red-light)', borderRadius: '10px', fontSize: '13px', color: 'var(--color-red)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="hgi-stroke hgi-alert-circle" style={{ fontSize: '15px', flexShrink: 0 }} />{error}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '11px 20px', borderRadius: '10px', border: '1.5px solid var(--color-border)', background: '#fff', fontSize: '14px', fontWeight: 500, fontFamily: 'var(--font-body)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>Annuler</button>
            <button type="submit" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 24px', borderRadius: '10px', border: 'none', background: saving ? 'var(--color-text-muted)' : 'var(--color-accent)', color: '#fff', fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? <><i className="hgi-stroke hgi-loading-01" style={{ fontSize: '15px', animation: 'spin 1s linear infinite' }} />Enregistrement…</> : (editing ? 'Enregistrer' : 'Créer la page')}
            </button>
          </div>
        </form>
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)}to{transform:rotate(360deg)} }`}</style>
    </div>
  )
}

// ── Card ───────────────────────────────────────────────────
function PageCard({ page, origin, onEdit, onDelete, onToggle }: {
  page: PaymentPage; origin: string
  onEdit: (p: PaymentPage) => void
  onDelete: (id: string) => void
  onToggle: (id: string, active: boolean) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  const link = `${origin}/pay/${page.slug}`
  const linkedProducts = page.payment_page_products
    .map((p) => p.products)
    .filter((p): p is NonNullable<typeof p> => p !== null)

  const handleCopy = () => {
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px', opacity: page.is_active ? 1 : 0.65, transition: 'box-shadow 0.2s, opacity 0.2s' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(26,22,20,0.06)' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
    >
      {/* Titre + statut */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="hgi-stroke hgi-link-square-01" style={{ fontSize: '20px', color: 'var(--color-accent)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px', color: 'var(--color-text)' }}>{page.title}</h3>
            <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '100px', background: page.is_active ? 'var(--color-green-light)' : 'var(--color-amber-light)', color: page.is_active ? 'var(--color-green)' : 'var(--color-amber)' }}>
              {page.is_active ? 'Active' : 'Inactive'}
            </span>
          </div>
          {page.description && <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', lineHeight: 1.5, marginTop: '4px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{page.description}</p>}
        </div>
      </div>

      {/* Produits associés */}
      {linkedProducts.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {linkedProducts.map((p) => (
            <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontSize: '12px', fontWeight: 500, padding: '4px 10px', borderRadius: '100px', border: '1px solid var(--color-border)' }}>
              <i className="hgi-stroke hgi-package-01" style={{ fontSize: '12px' }} />
              {p.name}
              <span style={{ color: 'var(--color-green)', fontWeight: 700 }}>· {formatPrice(p.price)}</span>
            </span>
          ))}
        </div>
      )}

      {/* Lien */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--color-surface)', borderRadius: '10px', padding: '10px 12px' }}>
        <i className="hgi-stroke hgi-link-01" style={{ fontSize: '14px', color: 'var(--color-text-muted)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: '12px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{link}</span>
        <button onClick={handleCopy} style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', border: 'none', background: copied ? 'var(--color-green-light)' : '#fff', color: copied ? 'var(--color-green)' : 'var(--color-text-muted)', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'all 0.2s' }}>
          <i className={`hgi-stroke ${copied ? 'hgi-checkmark-circle-01' : 'hgi-copy-01'}`} style={{ fontSize: '13px' }} />
          {copied ? 'Copié !' : 'Copier'}
        </button>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid var(--color-border)', paddingTop: '12px' }}>
        {confirmDelete ? (
          <>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', flex: 1 }}>Supprimer définitivement ?</span>
            <button onClick={() => setConfirmDelete(false)} style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: '#fff', fontSize: '12px', fontWeight: 500, fontFamily: 'var(--font-body)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>Annuler</button>
            <button onClick={() => onDelete(page.id)} style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: 'var(--color-red)', color: '#fff', fontSize: '12px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer' }}>Confirmer</button>
          </>
        ) : (
          <>
            <button onClick={() => onToggle(page.id, !page.is_active)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: '#fff', fontSize: '12px', fontWeight: 500, fontFamily: 'var(--font-body)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <i className={`hgi-stroke ${page.is_active ? 'hgi-pause-circle' : 'hgi-play-circle'}`} style={{ fontSize: '14px' }} />
              {page.is_active ? 'Désactiver' : 'Activer'}
            </button>
            <button onClick={() => onEdit(page)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: '#fff', fontSize: '12px', fontWeight: 500, fontFamily: 'var(--font-body)', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
              <i className="hgi-stroke hgi-pencil-edit-01" style={{ fontSize: '14px' }} />
              Modifier
            </button>
            <button onClick={() => setConfirmDelete(true)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--color-border)', background: '#fff', fontSize: '12px', fontWeight: 500, fontFamily: 'var(--font-body)', color: 'var(--color-text-muted)', cursor: 'pointer', marginLeft: 'auto' }} onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = 'var(--color-red-light)'; b.style.color = 'var(--color-red)'; b.style.borderColor = 'var(--color-red)' }} onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.background = '#fff'; b.style.color = 'var(--color-text-muted)'; b.style.borderColor = 'var(--color-border)' }}>
              <i className="hgi-stroke hgi-delete-01" style={{ fontSize: '14px' }} />
              Supprimer
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────
export default function PaymentPagesClient({ initialPages, products, userId, origin }: {
  initialPages: PaymentPage[]
  products: Product[]
  userId: string
  origin: string
}) {
  const supabase = createClient()
  const [pages, setPages] = useState<PaymentPage[]>(initialPages)
  const [showModal, setShowModal] = useState(false)
  const [editingPage, setEditingPage] = useState<PaymentPage | null>(null)

  const openAdd = () => { setEditingPage(null); setShowModal(true) }
  const openEdit = (p: PaymentPage) => { setEditingPage(p); setShowModal(true) }

  const handleSave = async (data: { title: string; description: string; product_ids: string[]; slug: string }): Promise<string | null> => {
    if (editingPage) {
      const { error: pageErr } = await supabase.from('payment_pages')
        .update({ title: data.title, description: data.description || null, slug: data.slug, updated_at: new Date().toISOString() })
        .eq('id', editingPage.id)
      if (pageErr) return pageErr.message

      await supabase.from('payment_page_products').delete().eq('page_id', editingPage.id)
      if (data.product_ids.length > 0) {
        const { error: pErr } = await supabase.from('payment_page_products')
          .insert(data.product_ids.map((pid) => ({ page_id: editingPage.id, product_id: pid })))
        if (pErr) return pErr.message
      }
      const { data: updated } = await supabase.from('payment_pages')
        .select('id, title, description, slug, is_active, created_at, payment_page_products(product_id, products(id, name, price, billing_cycle))')
        .eq('id', editingPage.id).single()
      if (updated) setPages((prev) => prev.map((p) => (p.id === editingPage.id ? updated as PaymentPage : p)))
    } else {
      const { data: inserted, error: pageErr } = await supabase.from('payment_pages')
        .insert({ user_id: userId, title: data.title, description: data.description || null, slug: data.slug })
        .select('id').single()
      if (pageErr) return pageErr.message

      if (data.product_ids.length > 0) {
        const { error: pErr } = await supabase.from('payment_page_products')
          .insert(data.product_ids.map((pid) => ({ page_id: inserted.id, product_id: pid })))
        if (pErr) return pErr.message
      }
      const { data: full } = await supabase.from('payment_pages')
        .select('id, title, description, slug, is_active, created_at, payment_page_products(product_id, products(id, name, price, billing_cycle))')
        .eq('id', inserted.id).single()
      if (full) setPages((prev) => [full as PaymentPage, ...prev])
    }
    return null
  }

  const handleDelete = async (id: string) => {
    await supabase.from('payment_pages').delete().eq('id', id)
    setPages((prev) => prev.filter((p) => p.id !== id))
  }

  const handleToggle = async (id: string, active: boolean) => {
    await supabase.from('payment_pages').update({ is_active: active }).eq('id', id)
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, is_active: active } : p)))
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
        <div>
          <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>Dashboard</p>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '28px', letterSpacing: '-0.02em', color: 'var(--color-text)' }}>Pages de paiement</h1>
        </div>
        <button onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '11px 20px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'all 0.2s' }} onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-accent-dark)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }} onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-accent)'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}>
          <i className="hgi-stroke hgi-add-01" style={{ fontSize: '16px' }} />
          Nouvelle page
        </button>
      </div>

      {pages.length === 0 ? (
        <div style={{ background: '#fff', border: '1.5px dashed var(--color-border)', borderRadius: '20px', padding: '72px 32px', textAlign: 'center', maxWidth: '440px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <i className="hgi-stroke hgi-link-square-01" style={{ fontSize: '26px', color: 'var(--color-text-muted)' }} />
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '20px', color: 'var(--color-text)', marginBottom: '8px' }}>Aucune page de paiement</h2>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: 1.65, marginBottom: '24px' }}>Créez une page de paiement, partagez le lien avec vos clients. Ils paient, vous recevez.</p>
          <button onClick={openAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '11px 20px', background: 'var(--color-accent)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer' }}>
            <i className="hgi-stroke hgi-add-01" style={{ fontSize: '16px' }} />
            Créer ma première page
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
          {pages.map((page) => (
            <PageCard key={page.id} page={page} origin={origin} onEdit={openEdit} onDelete={handleDelete} onToggle={handleToggle} />
          ))}
        </div>
      )}

      {showModal && <PageModal editing={editingPage} products={products} onClose={() => setShowModal(false)} onSave={handleSave} />}
    </>
  )
}
