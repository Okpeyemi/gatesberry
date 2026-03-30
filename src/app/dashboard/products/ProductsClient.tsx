"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export interface Product {
  id: string
  name: string
  description: string | null
  price: number
  currency: string
  is_active: boolean
  created_at: string
}

const formatPrice = (price: number) =>
  `${new Intl.NumberFormat('fr-FR').format(price)} FCFA`

// ── Modal ──────────────────────────────────────────────────
function ProductModal({
  editing,
  onClose,
  onSave,
}: {
  editing: Product | null
  onClose: () => void
  onSave: (data: { name: string; description: string; price: number }) => Promise<string | null>
}) {
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [price, setPrice] = useState(editing ? String(editing.price) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const priceNum = parseInt(price, 10)
    if (isNaN(priceNum) || priceNum < 0) {
      setError('Veuillez entrer un prix valide.')
      return
    }
    if (!name.trim()) {
      setError('Le nom du produit est requis.')
      return
    }

    setSaving(true)
    const err = await onSave({ name: name.trim(), description: description.trim(), price: priceNum })
    setSaving(false)
    if (err) setError(err)
    else onClose()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 14px',
    border: '1.5px solid var(--color-border)',
    borderRadius: '10px',
    fontSize: '14px',
    fontFamily: 'var(--font-body)',
    color: 'var(--color-text)',
    background: '#fff',
    outline: 'none',
    transition: 'border-color 0.2s',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(26,22,20,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
        padding: '24px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="anim-fade-up"
        style={{
          background: '#fff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 24px 64px rgba(26,22,20,0.14)',
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
            {editing ? 'Modifier le produit' : 'Nouveau produit'}
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '18px',
            }}
          >
            <i className="hgi-stroke hgi-cancel-01" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
          {/* Nom */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
              Nom du produit <span style={{ color: 'var(--color-accent)' }}>*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex : Abonnement Premium"
              required
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
              Description
              <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: '6px' }}>optionnel</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Décrivez ce que comprend ce plan…"
              rows={3}
              style={{
                ...inputStyle,
                resize: 'none',
                lineHeight: 1.6,
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
            />
          </div>

          {/* Prix */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--color-text)', marginBottom: '6px' }}>
              Prix <span style={{ color: 'var(--color-accent)' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="5000"
                min={0}
                required
                style={{ ...inputStyle, paddingRight: '72px' }}
                onFocus={(e) => (e.target.style.borderColor = 'var(--color-accent)')}
                onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
              />
              <span
                style={{
                  position: 'absolute',
                  right: '14px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--color-text-muted)',
                  pointerEvents: 'none',
                }}
              >
                FCFA
              </span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                marginBottom: '16px',
                padding: '11px 14px',
                background: 'var(--color-red-light)',
                borderRadius: '10px',
                fontSize: '13px',
                color: 'var(--color-red)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <i className="hgi-stroke hgi-alert-circle" style={{ fontSize: '15px', flexShrink: 0 }} />
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '11px 20px',
                borderRadius: '10px',
                border: '1.5px solid var(--color-border)',
                background: '#fff',
                fontSize: '14px',
                fontWeight: 500,
                fontFamily: 'var(--font-body)',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '11px 24px',
                borderRadius: '10px',
                border: 'none',
                background: saving ? 'var(--color-text-muted)' : 'var(--color-accent)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                fontFamily: 'var(--font-body)',
                cursor: saving ? 'not-allowed' : 'pointer',
                transition: 'background 0.2s',
              }}
            >
              {saving ? (
                <>
                  <i className="hgi-stroke hgi-loading-01" style={{ fontSize: '15px', animation: 'spin 1s linear infinite' }} />
                  Enregistrement…
                </>
              ) : (
                <>{editing ? 'Enregistrer' : 'Créer le produit'}</>
              )}
            </button>
          </div>
        </form>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Card ───────────────────────────────────────────────────
function ProductCard({
  product,
  onEdit,
  onDelete,
}: {
  product: Product
  onEdit: (p: Product) => void
  onDelete: (id: string) => void
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    onDelete(product.id)
  }

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid var(--color-border)',
        borderRadius: '16px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        transition: 'box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(26,22,20,0.06)'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
      }}
    >
      {/* Icon + name */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--color-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <i className="hgi-stroke hgi-cube-01" style={{ fontSize: '20px', color: 'var(--color-accent)' }} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '16px',
              color: 'var(--color-text)',
              marginBottom: '2px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {product.name}
          </h3>
          {product.description && (
            <p
              style={{
                fontSize: '13px',
                color: 'var(--color-text-muted)',
                lineHeight: 1.5,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {product.description}
            </p>
          )}
        </div>
      </div>

      {/* Prix */}
      <div
        style={{
          display: 'inline-flex',
          alignSelf: 'flex-start',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--color-green-light)',
          color: 'var(--color-green)',
          fontSize: '14px',
          fontWeight: 700,
          padding: '5px 12px',
          borderRadius: '100px',
        }}
      >
        <i className="hgi-stroke hgi-money-bag-01" style={{ fontSize: '14px' }} />
        {formatPrice(product.price)}
      </div>

      {/* Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          borderTop: '1px solid var(--color-border)',
          paddingTop: '12px',
          marginTop: 'auto',
        }}
      >
        {confirmDelete ? (
          <>
            <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', flex: 1 }}>
              Supprimer définitivement ?
            </span>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: '#fff',
                fontSize: '12px',
                fontWeight: 500,
                fontFamily: 'var(--font-body)',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
              }}
            >
              Annuler
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--color-red)',
                color: '#fff',
                fontSize: '12px',
                fontWeight: 600,
                fontFamily: 'var(--font-body)',
                cursor: deleting ? 'not-allowed' : 'pointer',
              }}
            >
              {deleting ? 'Suppression…' : 'Confirmer'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onEdit(product)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: '#fff',
                fontSize: '13px',
                fontWeight: 500,
                fontFamily: 'var(--font-body)',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-text)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-muted)'
              }}
            >
              <i className="hgi-stroke hgi-pencil-edit-01" style={{ fontSize: '14px' }} />
              Modifier
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: '#fff',
                fontSize: '13px',
                fontWeight: 500,
                fontFamily: 'var(--font-body)',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                marginLeft: 'auto',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-red)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-red)'
                ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--color-red-light)'
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-muted)'
                ;(e.currentTarget as HTMLButtonElement).style.background = '#fff'
              }}
            >
              <i className="hgi-stroke hgi-delete-01" style={{ fontSize: '14px' }} />
              Supprimer
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main client component ──────────────────────────────────
export default function ProductsClient({
  initialProducts,
  userId,
}: {
  initialProducts: Product[]
  userId: string
}) {
  const supabase = createClient()
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [showModal, setShowModal] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  const openAdd = () => { setEditingProduct(null); setShowModal(true) }
  const openEdit = (p: Product) => { setEditingProduct(p); setShowModal(true) }
  const closeModal = () => setShowModal(false)

  const handleSave = async (data: { name: string; description: string; price: number }): Promise<string | null> => {
    if (editingProduct) {
      const { data: updated, error } = await supabase
        .from('products')
        .update({
          name: data.name,
          description: data.description || null,
          price: data.price,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingProduct.id)
        .select()
        .single()
      if (error) return error.message
      setProducts((prev) => prev.map((p) => (p.id === editingProduct.id ? updated : p)))
    } else {
      const { data: inserted, error } = await supabase
        .from('products')
        .insert({
          user_id: userId,
          name: data.name,
          description: data.description || null,
          price: data.price,
          currency: 'XOF',
        })
        .select()
        .single()
      if (error) return error.message
      setProducts((prev) => [inserted, ...prev])
    }
    return null
  }

  const handleDelete = async (id: string) => {
    await supabase.from('products').delete().eq('id', id)
    setProducts((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <>
      {/* ── Header ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px',
        }}
      >
        <div>
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
            Produits
          </h1>
        </div>

        <button
          onClick={openAdd}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '11px 20px',
            background: 'var(--color-accent)',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 600,
            fontFamily: 'var(--font-body)',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-accent-dark)'
            ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-accent)'
            ;(e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'
          }}
        >
          <i className="hgi-stroke hgi-add-01" style={{ fontSize: '16px' }} />
          Ajouter un produit
        </button>
      </div>

      {/* ── Liste ou empty state ── */}
      {products.length === 0 ? (
        <div
          style={{
            background: '#fff',
            border: '1.5px dashed var(--color-border)',
            borderRadius: '20px',
            padding: '72px 32px',
            textAlign: 'center',
            maxWidth: '440px',
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
            <i className="hgi-stroke hgi-cube-01" style={{ fontSize: '26px', color: 'var(--color-text-muted)' }} />
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
            Aucun produit pour l'instant
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', lineHeight: 1.65, marginBottom: '24px' }}>
            Créez vos premiers plans ou abonnements. Ils seront ensuite associés à vos pages de paiement.
          </p>
          <button
            onClick={openAdd}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '11px 20px',
              background: 'var(--color-accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'var(--font-body)',
              cursor: 'pointer',
            }}
          >
            <i className="hgi-stroke hgi-add-01" style={{ fontSize: '16px' }} />
            Créer mon premier produit
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* ── Modal ── */}
      {showModal && (
        <ProductModal
          editing={editingProduct}
          onClose={closeModal}
          onSave={handleSave}
        />
      )}
    </>
  )
}
