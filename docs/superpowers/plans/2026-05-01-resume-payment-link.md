# Reprise de paiement — lien copiable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au marchand de copier depuis `/dashboard/transactions` une URL FedaPay fraîche pour les transactions en `pending`, afin de la renvoyer au client.

**Architecture:** Une route Next.js serveur `GET /api/transactions/[id]/payment-link` qui appelle `POST /v1/transactions/{fedapay_id}/token` chez FedaPay et renvoie une URL fraîche. Le client `TransactionsClient.tsx` ajoute un bouton "Copier le lien" pour chaque transaction `pending` qui appelle cette route puis copie via `navigator.clipboard`.

**Tech Stack:** Next.js 16 (App Router, dynamic route), `@supabase/ssr` (server client avec RLS), FedaPay REST v1, React 19 client component.

**Note testing:** Le projet n'a pas de framework de test installé (pas de `jest`/`vitest` dans `package.json`). Les vérifications se font via `curl` + test navigateur. C'est cohérent avec le reste du codebase.

---

## File Structure

- **Créé :** `src/app/api/transactions/[id]/payment-link/route.ts` — endpoint serveur qui appelle FedaPay et retourne `{ url }`.
- **Modifié :** `src/app/dashboard/transactions/TransactionsClient.tsx` — ajout du bouton "Copier le lien" pour les transactions `pending` + handler clipboard.

---

## Task 1: Backend route — création de `/api/transactions/[id]/payment-link`

**Files:**
- Create: `src/app/api/transactions/[id]/payment-link/route.ts`

- [ ] **Step 1: Créer le fichier route avec l'implémentation complète**

Fichier : `src/app/api/transactions/[id]/payment-link/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

const FEDAPAY_SECRET = process.env.FEDAPAY_SECRET_KEY!
const FEDAPAY_ENV = process.env.FEDAPAY_ENVIRONMENT ?? 'sandbox'
const FEDAPAY_BASE =
  FEDAPAY_ENV === 'live'
    ? 'https://api.fedapay.com/v1'
    : 'https://sandbox-api.fedapay.com/v1'

/**
 * GET /api/transactions/[id]/payment-link
 * Génère un lien de paiement frais pour une transaction pending
 * appartenant au marchand authentifié.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // RLS filtre déjà par merchant_id, mais on ajoute le filtre explicite
  // pour fail-fast et un message d'erreur plus clair.
  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .select('id, fedapay_transaction_id, status')
    .eq('id', id)
    .eq('merchant_id', user.id)
    .single()

  if (txErr || !tx) {
    return NextResponse.json({ error: 'Transaction introuvable' }, { status: 404 })
  }

  if (tx.status !== 'pending') {
    return NextResponse.json(
      { error: 'Transaction non éligible à la reprise' },
      { status: 400 },
    )
  }

  if (!tx.fedapay_transaction_id) {
    return NextResponse.json(
      { error: 'Transaction sans identifiant FedaPay' },
      { status: 400 },
    )
  }

  const fpRes = await fetch(
    `${FEDAPAY_BASE}/transactions/${tx.fedapay_transaction_id}/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${FEDAPAY_SECRET}`,
        'Content-Type': 'application/json',
      },
    },
  )

  if (!fpRes.ok) {
    const body = await fpRes.text()
    console.error('[payment-link] FedaPay error:', fpRes.status, body)
    return NextResponse.json({ error: 'Erreur FedaPay' }, { status: 502 })
  }

  const data = await fpRes.json()
  const url: string | undefined = data?.token?.url ?? data?.url
  if (!url) {
    console.error('[payment-link] FedaPay: réponse inattendue:', data)
    return NextResponse.json({ error: 'Réponse FedaPay inattendue' }, { status: 502 })
  }

  return NextResponse.json({ url })
}
```

- [ ] **Step 2: Vérifier que TypeScript compile**

Run: `cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit`
Expected: aucune erreur sur le nouveau fichier (peut y avoir des erreurs préexistantes ailleurs).

- [ ] **Step 3: Vérifier la route en dev (manual smoke-test)**

Préparation :
1. Démarrer le dev server : `pnpm dev` (port 3000 par défaut).
2. Identifier une transaction `pending` réelle dans `/dashboard/transactions` ou via Supabase → noter son UUID.
3. Récupérer le cookie de session Supabase (`sb-<project>-auth-token`) depuis le navigateur (DevTools → Application → Cookies).

Test 401 (sans cookie) :
```bash
curl -i http://localhost:3000/api/transactions/<uuid>/payment-link
```
Expected: `HTTP/1.1 401` avec `{"error":"Non authentifié"}`.

Test 404 (UUID bidon, avec cookie) :
```bash
curl -i -H 'Cookie: sb-...-auth-token=<value>' \
  http://localhost:3000/api/transactions/00000000-0000-0000-0000-000000000000/payment-link
```
Expected: `HTTP/1.1 404`.

Test happy path (UUID d'une transaction `pending` au marchand connecté) :
```bash
curl -i -H 'Cookie: sb-...-auth-token=<value>' \
  http://localhost:3000/api/transactions/<uuid-pending>/payment-link
```
Expected: `HTTP/1.1 200` avec `{"url":"https://..."}`. L'URL doit être ouvrable dans un navigateur et afficher la page de paiement FedaPay.

Test 400 (transaction approved) :
```bash
curl -i -H 'Cookie: sb-...-auth-token=<value>' \
  http://localhost:3000/api/transactions/<uuid-approved>/payment-link
```
Expected: `HTTP/1.1 400` avec `{"error":"Transaction non éligible à la reprise"}`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/transactions/[id]/payment-link/route.ts
git commit -m "feat(transactions): add payment-link endpoint for resuming pending payments"
```

---

## Task 2: Frontend — bouton "Copier le lien" sur transactions pending

**Files:**
- Modify: `src/app/dashboard/transactions/TransactionsClient.tsx`

- [ ] **Step 1: Ajouter les états locaux**

Dans `TransactionsClient.tsx`, juste après les `useState` existants (vers la ligne 56-59), ajouter deux nouveaux états :

```typescript
  const [loadingLink, setLoadingLink] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
```

L'état complet ressemble alors à :
```typescript
  const [filter, setFilter] = useState<FilterStatus>('all')
  const [page, setPage] = useState(0)
  const [receiptSet, setReceiptSet] = useState<Set<string>>(new Set(existingReceipts))
  const [loadingReceipt, setLoadingReceipt] = useState<string | null>(null)
  const [loadingLink, setLoadingLink] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
```

- [ ] **Step 2: Ajouter le handler `handleCopyLink`**

Dans le même composant, juste après la fonction `handleDownload` (vers la ligne 127), ajouter :

```typescript
  const handleCopyLink = async (txId: string) => {
    setLoadingLink(txId)
    try {
      const res = await fetch(`/api/transactions/${txId}/payment-link`)
      const data = await res.json()
      if (!res.ok) {
        alert(data.error ?? 'Erreur lors de la récupération du lien')
        return
      }
      await navigator.clipboard.writeText(data.url)
      setCopiedLink(txId)
      setTimeout(() => {
        setCopiedLink((current) => (current === txId ? null : current))
      }, 1500)
    } catch {
      alert('Erreur réseau')
    } finally {
      setLoadingLink(null)
    }
  }
```

- [ ] **Step 3: Ajouter le rendu du bouton pour transactions `pending`**

Dans le `.map((tx, idx) => { ... })` (vers la ligne 216), juste avant le bloc `{/* Receipt button for approved */}` (ligne 284), ajouter le bloc suivant :

```tsx
                  {/* Bouton "Copier le lien" pour les transactions en attente */}
                  {tx.status === 'pending' && (
                    <div style={{ flexShrink: 0 }}>
                      <button
                        onClick={() => handleCopyLink(tx.id)}
                        disabled={loadingLink === tx.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          background: '#fff',
                          color: copiedLink === tx.id ? 'var(--color-green)' : 'var(--color-text)',
                          fontSize: '12px',
                          fontWeight: 600,
                          fontFamily: 'var(--font-body)',
                          cursor: loadingLink === tx.id ? 'wait' : 'pointer',
                          opacity: loadingLink === tx.id ? 0.6 : 1,
                          transition: 'all 0.15s',
                        }}
                      >
                        <i
                          className={`hgi-stroke ${
                            copiedLink === tx.id ? 'hgi-checkmark-circle-02' : 'hgi-copy-01'
                          }`}
                          style={{ fontSize: '14px' }}
                        />
                        {loadingLink === tx.id
                          ? '...'
                          : copiedLink === tx.id
                            ? 'Copié'
                            : 'Copier le lien'}
                      </button>
                    </div>
                  )}

```

Le bloc doit être placé **juste avant** :
```tsx
                  {/* Receipt button for approved */}
                  {tx.status === 'approved' && (
```

Cela garantit que le bouton apparaît à la même position visuelle que les boutons de reçu (avant la colonne montant/date).

- [ ] **Step 4: Vérifier que TypeScript compile**

Run: `cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit`
Expected: aucune erreur sur le fichier modifié.

- [ ] **Step 5: Test manuel dans le navigateur**

1. `pnpm dev` (si pas déjà lancé).
2. Se connecter en tant que marchand qui a au moins une transaction `pending`.
3. Aller sur `/dashboard/transactions`.
4. Pour une transaction avec le badge "En attente" :
   - Vérifier que le bouton "Copier le lien" (icône clipboard) apparaît à côté.
   - Cliquer → vérifier que le bouton affiche "..." brièvement, puis "Copié ✓" (icône check verte) pendant ~1.5s, puis revient à "Copier le lien".
   - Coller le presse-papiers (Ctrl+V dans la barre d'URL d'un nouvel onglet) → vérifier que c'est une URL `https://...fedapay.com/...` valide qui ouvre la page de paiement.
5. Pour une transaction `approved` : vérifier que le bouton "Copier le lien" **n'apparaît pas** (seuls les boutons reçu sont visibles).
6. Pour une transaction `canceled` / `declined` : vérifier qu'aucun bouton n'apparaît.
7. Test d'erreur — couper la clé `FEDAPAY_SECRET_KEY` dans `.env.local` (mettre une valeur invalide), redémarrer `pnpm dev`, cliquer sur "Copier le lien" → vérifier que l'`alert("Erreur FedaPay")` (ou similaire) s'affiche. Restaurer la clé après.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/transactions/TransactionsClient.tsx
git commit -m "feat(transactions): add 'Copier le lien' button for pending transactions"
```

---

## Self-review summary

**Spec coverage check :**
- Décision "génération à la demande" → Task 1, route appelle FedaPay à chaque clic ✓
- Décision "bouton Copier simple" → Task 2 Step 3 ✓
- Auth via cookies marchand + RLS → Task 1 Step 1 ✓
- Tableau d'erreurs (401/404/400/502) → Task 1 Step 1 + smoke tests Step 3 ✓
- Feedback "Copié ✓" 1.5s → Task 2 Step 2 (`setTimeout`) + Step 3 (libellé conditionnel) ✓
- Pas de stockage en DB → aucune migration dans le plan ✓
- Pas de bouton WhatsApp → confirmé hors-scope ✓

**Placeholder scan :** aucun TBD/TODO. Toutes les commandes et codes sont complets.

**Type consistency :** `loadingLink`/`copiedLink` (string | null) cohérents entre les 3 steps de Task 2. Champ `data.url` (response JSON) cohérent entre route (Task 1) et handler (Task 2 Step 2).
