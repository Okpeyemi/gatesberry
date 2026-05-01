# Reprise de paiement — lien copiable pour transactions pending

**Date :** 2026-05-01
**Statut :** spec validée

## Problème

Quand un paiement échoue ou n'est pas finalisé, la transaction reste en statut `pending` dans Supabase. Le marchand n'a aucun moyen depuis le dashboard de récupérer le lien FedaPay pour le renvoyer au client.

## Objectif

Sur `/dashboard/transactions`, pour chaque ligne en statut `pending`, exposer un bouton **"Copier le lien"** qui copie une URL FedaPay fraîche dans le presse-papiers, prête à être collée dans WhatsApp/SMS par le marchand.

## Décisions clés

- **Génération à la demande** (pas de stockage en DB). Chaque clic régénère un token FedaPay frais via `POST /v1/transactions/{id}/token`. Évite les soucis d'expiration de token.
- **Bouton simple "Copier"** (pas de menu multi-actions). Cohérent avec le projet d'automatisation WhatsApp côté serveur prévu plus tard.

## Architecture

### Backend — `GET /api/transactions/[id]/payment-link`

Nouvelle route serveur.

**Authentification :** `createClient()` côté serveur (cookies marchand). La RLS Supabase garantit que `transactions.select` filtre déjà par `merchant_id = auth.uid()`.

**Logique :**
1. Vérifier `user` → 401 sinon.
2. `SELECT id, fedapay_transaction_id, status FROM transactions WHERE id = :id AND merchant_id = user.id` → 404 si introuvable.
3. Si `status !== 'pending'` → 400 (`Transaction non éligible à la reprise`).
4. `POST ${FEDAPAY_BASE}/transactions/{fedapay_transaction_id}/token` avec `Authorization: Bearer ${FEDAPAY_SECRET_KEY}`.
5. Si FedaPay échoue → 502 + log côté serveur.
6. Réponse : `{ url: data.token.url }`.

**Constantes :** réutilise `FEDAPAY_SECRET_KEY`, `FEDAPAY_ENVIRONMENT` et la base URL déjà utilisées dans `src/app/api/pay/route.ts` et `src/app/api/payment/callback/route.ts`.

### Frontend — `src/app/dashboard/transactions/TransactionsClient.tsx`

Modification dans la même ligne où s'affichent les boutons reçu.

**État local supplémentaire :**
- `loadingLink: string | null` — id de la transaction dont le lien est en cours de génération.
- `copiedLink: string | null` — id dont la confirmation "Copié ✓" est encore visible (timeout 1.5s).

**Handler :**
```ts
async function handleCopyLink(txId: string) {
  setLoadingLink(txId)
  try {
    const res = await fetch(`/api/transactions/${txId}/payment-link`)
    const data = await res.json()
    if (!res.ok) { alert(data.error ?? 'Erreur'); return }
    await navigator.clipboard.writeText(data.url)
    setCopiedLink(txId)
    setTimeout(() => setCopiedLink((c) => (c === txId ? null : c)), 1500)
  } catch {
    alert('Erreur réseau')
  } finally {
    setLoadingLink(null)
  }
}
```

**Rendu :** dans la branche `tx.status === 'pending'`, ajouter un bouton avec :
- Icône `hgi-copy-01` (état initial) ou `hgi-checkmark-circle-02` (état "Copié ✓").
- Libellé : `Copier le lien` / `...` (loading) / `Copié ✓` (1.5s).
- Style cohérent avec le bouton "Télécharger" (bordure neutre, fond blanc).

## Sécurité

- Le `FEDAPAY_SECRET_KEY` n'est jamais exposé côté client. La route serveur fait l'appel.
- La RLS Supabase empêche un marchand d'obtenir un lien pour une transaction qui ne lui appartient pas (filtrage `merchant_id`).
- Pas de service-role nécessaire ici (lecture par marchand authentifié).

## Erreurs gérées

| Cas | Code | Message |
|-----|------|---------|
| Pas connecté | 401 | "Non authentifié" |
| Transaction introuvable / pas au marchand | 404 | "Transaction introuvable" |
| Statut ≠ pending | 400 | "Transaction non éligible à la reprise" |
| FedaPay HTTP error | 502 | "Erreur FedaPay" |
| Réseau côté client | — | `alert("Erreur réseau")` |
| `navigator.clipboard` indispo | — | échec silencieux (HTTPS/localhost requis — OK en dev et prod) |

## Hors-scope

- Pas de stockage du `payment_url` en DB (régénéré à chaque clic).
- Pas d'automatisation WhatsApp (sujet à part — déclenchera un appel à cette même route depuis un job serveur).
- Pas de cron de nettoyage / re-vérification automatique des `pending` (sujet séparé).
- Pas de fallback `document.execCommand('copy')` pour vieux navigateurs.

## Fichiers touchés

- **Créé :** `src/app/api/transactions/[id]/payment-link/route.ts`
- **Modifié :** `src/app/dashboard/transactions/TransactionsClient.tsx`
- **Aucune** migration SQL.
