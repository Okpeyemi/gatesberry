# Retraits marchand (FedaPay payouts)

**Date :** 2026-05-05
**Statut :** spec validée

## Problème

Les marchands accumulent un solde sur Gatesberry au fil des transactions `approved`, mais n'ont aucun moyen de récupérer ces fonds. Il faut une page de demande de retrait qui déclenche un payout FedaPay vers le mobile money du marchand.

## Objectif

Sur `/dashboard/withdrawals`, le marchand voit son solde retirable et peut demander un retrait (partiel ou total). La demande est validée automatiquement si `< 100 000 XOF`, manuellement (par un admin) sinon. Une fois validée, l'argent part via l'API FedaPay payouts vers le mobile money du marchand.

## Décisions clés

- **Solde global** = `Σ transactions.amount approved − Σ withdrawals.fedapay_amount non-failed`. Pas de traçabilité 1↔1 transaction/payout. Calcul via fonction SQL réutilisable.
- **Choix marchand** : montant partiel ou total (raccourcis 25%/50%/100%).
- **Validation auto/manuelle** : seuil 100 000 XOF. En dessous → cron Supabase pousse à FedaPay sous 1 min. Au-dessus → admin valide depuis dashboard, notification email à l'admin via Resend.
- **Min** : 500 XOF. **Max** : 1 retrait par marchand par jour.
- **Frais** : pass-through pur. FedaPay prélève sa commission, le marchand paie cette commission (solde décompté du brut, pas du net). Gatesberry ne marge pas sur les retraits (la marge est déjà prise à l'encaissement).
- **Hold** : T+0 (transaction `approved` → solde retirable immédiat). Pas de fenêtre anti-fraude car les paiements mobile money en Afrique de l'Ouest sont push-only (chargebacks quasi-nuls).
- **Coordonnées de versement** : pré-remplies depuis `profiles`, override possible à chaque demande. Snapshot figé dans `withdrawals` à la création.
- **Suivi** : webhook FedaPay (route prête en bonus) + polling cron Supabase toutes les 5 min comme primary.
- **Échec** : `failed` terminal, solde restitué automatiquement via la formule SQL (les `failed` ne sont pas décomptés).
- **Annulation** : possible tant que `status = 'pending_review'`, plus après envoi à FedaPay.
- **Admin** : colonne `is_admin BOOLEAN` sur `profiles`. Layout `/dashboard/admin/*` vérifie le flag, routes API re-vérifient.
- **Notifications v1** : email admin uniquement (sur `pending_review ≥ 100k`). Pas d'email marchand (visible dans le dashboard).
- **Centralisation des frais** : un seul fichier `src/lib/fedapay/fees.ts` exporte la grille — utilisé par 4 endroits (route `pay`, route `withdrawals`, page `Pricing`, sélecteur SIM `Products`).

## Architecture

### 1. Modèle de données — 3 migrations SQL

**`supabase/migrations/011_add_country_and_admin_to_profiles.sql`**
```sql
ALTER TABLE public.profiles
  ADD COLUMN country  TEXT,                              -- code ISO bj/ci/sn/tg/ml/bf/ne
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
```

**`supabase/migrations/012_create_withdrawals.sql`**
```sql
CREATE TABLE public.withdrawals (
  id                      UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Montants (XOF entiers)
  amount                  INTEGER      NOT NULL CHECK (amount >= 500), -- net que le marchand reçoit
  fedapay_amount          INTEGER,                                      -- brut envoyé à FedaPay (calc reverse)
  fee                     INTEGER,                                      -- fedapay_amount - amount

  -- Coordonnées de versement (snapshot figé à la création)
  receiver_name           TEXT         NOT NULL,
  receiver_phone          TEXT         NOT NULL,
  receiver_country        TEXT         NOT NULL,                        -- code ISO
  receiver_provider       TEXT         NOT NULL,                        -- mtn / moov / orange / wave / mixx / celtiis / airtel

  -- Workflow
  status                  TEXT         NOT NULL DEFAULT 'pending_review',
  -- pending_review | approved | rejected | sent_to_fedapay | processing | sent | failed | cancelled
  rejection_reason        TEXT,                                         -- visible marchand si admin refuse
  failure_reason          TEXT,                                         -- raison FedaPay si failed

  -- Liens FedaPay
  fedapay_payout_id       BIGINT       UNIQUE,
  merchant_reference      TEXT         UNIQUE,                          -- format GB-PAYOUT-<uuid>

  -- Anti-retry infini de l'auto-approve
  auto_approve_attempts   INTEGER      NOT NULL DEFAULT 0,

  -- Audit
  reviewed_by             UUID         REFERENCES auth.users(id),       -- admin (NULL si auto-approuvé)
  reviewed_at             TIMESTAMPTZ,
  sent_at                 TIMESTAMPTZ,                                  -- quand status passe à sent

  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX withdrawals_merchant_id_idx ON public.withdrawals (merchant_id);
CREATE INDEX withdrawals_status_idx      ON public.withdrawals (status);
CREATE INDEX withdrawals_fedapay_id_idx  ON public.withdrawals (fedapay_payout_id);

-- RLS
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Marchand lit ses retraits, admin lit tout"
  ON public.withdrawals FOR SELECT
  USING (auth.uid() = merchant_id
         OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Marchand crée son retrait"
  ON public.withdrawals FOR INSERT
  WITH CHECK (auth.uid() = merchant_id);

-- UPDATE interdit côté client : passe par les routes API en service_role
CREATE POLICY "No client UPDATE"
  ON public.withdrawals FOR UPDATE
  USING (FALSE);

CREATE TRIGGER withdrawals_updated_at
  BEFORE UPDATE ON public.withdrawals
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
```

**`supabase/migrations/013_create_balance_function.sql`**
```sql
CREATE OR REPLACE FUNCTION public.get_merchant_balance(p_merchant_id UUID)
RETURNS INTEGER
LANGUAGE SQL STABLE AS $$
  SELECT COALESCE(
    (SELECT SUM(amount)::INT FROM public.transactions
       WHERE merchant_id = p_merchant_id AND status = 'approved'), 0
  )
  -
  COALESCE(
    (SELECT SUM(fedapay_amount)::INT FROM public.withdrawals
       WHERE merchant_id = p_merchant_id
         AND status NOT IN ('failed', 'rejected', 'cancelled')), 0
  );
$$;
```

**Notes** :
- `failed/rejected/cancelled` ne décomptent pas → restitution automatique.
- Décompte sur `fedapay_amount` (brut), pas sur `amount` → le marchand paie la commission FedaPay sur son solde.
- Snapshot des coordonnées : édition ultérieure de `profiles` n'affecte pas un retrait en cours.

### 2. Centralisation des frais — `src/lib/fedapay/fees.ts` (NOUVEAU)

**Source de vérité unique** pour les taux FedaPay et la marge Gatesberry. Refactor de 3 fichiers existants.

```typescript
// src/lib/fedapay/fees.ts
type Provider = { code: string; label: string }

export type OperatorFee = {
  id: string             // 'bj-all', 'ci-wave', ...
  countryCode: string    // 'bj' (utilisé par l'API)
  countryLabel: string   // 'Bénin' (UI)
  providers: Provider[]
  rate: number           // pourcent
}

export const FEDAPAY_OPERATOR_FEES: OperatorFee[] = [
  { id: 'bj-all',    countryCode: 'bj', countryLabel: 'Bénin',
    providers: [{code:'mtn',label:'MTN'},{code:'moov',label:'Moov'},{code:'celtiis',label:'Celtiis'}], rate: 1.8 },
  { id: 'ci-wave',   countryCode: 'ci', countryLabel: "Côte d'Ivoire",
    providers: [{code:'wave',label:'Wave'},{code:'mtn',label:'MTN'}], rate: 4.0 },
  { id: 'ci-orange', countryCode: 'ci', countryLabel: "Côte d'Ivoire",
    providers: [{code:'orange',label:'Orange Money'}], rate: 3.3 },
  { id: 'sn-wave',   countryCode: 'sn', countryLabel: 'Sénégal',
    providers: [{code:'wave',label:'Wave'}], rate: 4.0 },
  { id: 'sn-orange', countryCode: 'sn', countryLabel: 'Sénégal',
    providers: [{code:'orange',label:'Orange Money'}], rate: 2.9 },
  { id: 'sn-mixx',   countryCode: 'sn', countryLabel: 'Sénégal',
    providers: [{code:'mixx',label:'Mixx by Yas'}], rate: 2.0 },
  { id: 'tg-moov',   countryCode: 'tg', countryLabel: 'Togo',
    providers: [{code:'moov',label:'Moov Money'}], rate: 2.5 },
  { id: 'tg-mixx',   countryCode: 'tg', countryLabel: 'Togo',
    providers: [{code:'mixx',label:'Mixx by Yas'}], rate: 3.5 },
  { id: 'ml-orange', countryCode: 'ml', countryLabel: 'Mali',
    providers: [{code:'orange',label:'Orange Money'}], rate: 4.0 },
  { id: 'bf-all',    countryCode: 'bf', countryLabel: 'Burkina-Faso',
    providers: [{code:'moov',label:'Moov'},{code:'orange',label:'Orange'}], rate: 4.0 },
  { id: 'ne-airtel', countryCode: 'ne', countryLabel: 'Niger',
    providers: [{code:'airtel',label:'Airtel Money'}], rate: 4.0 },
]

export const DEFAULT_OPERATOR_RATE = 3.0

export function getOperatorRate(countryCode: string, providerCode: string): number {
  for (const e of FEDAPAY_OPERATOR_FEES) {
    if (e.countryCode === countryCode && e.providers.some(p => p.code === providerCode)) return e.rate
  }
  return DEFAULT_OPERATOR_RATE
}

export const FEDAPAY_RATES_DISPLAY = FEDAPAY_OPERATOR_FEES.map(e => ({
  id: e.id,
  country: e.countryLabel,
  providers: e.providers.map(p => p.label).join(', '),
  fee: e.rate,
}))

export function gatesberryFee(amount: number) {
  return amount < 10000
    ? Math.round(amount * 0.02 + 50)
    : Math.round(amount * 0.01 + 100)
}
```

**Refactors drop-in** (comportement préservé, valeurs identiques) :

| Fichier | Action |
|---|---|
| `src/app/api/pay/route.ts` | Supprime `OPERATOR_FEES` local + formules Gatesberry inline → `import { getOperatorRate, gatesberryFee } from '@/lib/fedapay/fees'`. |
| `src/components/Pricing.tsx` | Supprime `const rates = [...]` → `import { FEDAPAY_RATES_DISPLAY as rates } from '@/lib/fedapay/fees'`. |
| `src/app/dashboard/products/ProductsClient.tsx` | Supprime `const SIM_RATES = [...]` → `import { FEDAPAY_RATES_DISPLAY as SIM_RATES } from '@/lib/fedapay/fees'`. |

### 3. Calcul reverse des frais payout

```typescript
// src/lib/fedapay/payout-fees.ts
import { getOperatorRate } from './fees'

export function reverseFedapayPayoutAmount(net: number, country: string, provider: string) {
  const r = getOperatorRate(country, provider) / 100
  let brut = Math.ceil(net / (1 - r))
  for (let i = 0; i < 500; i++) {
    const fee = Math.round(brut * r)
    const received = brut - fee
    if (received === net) break
    else if (received < net) brut++
    else brut--
  }
  return { fedapay_amount: brut, fee: brut - net }
}
```

Même mécanique itérative que `reverseFedapayAmount()` ligne 60 de `pay/route.ts`, sans la marge Gatesberry.

### 4. Routes API Next.js

**Marchand (cookies + RLS)** :

| Route | Rôle |
|---|---|
| `POST /api/withdrawals` | Crée la demande. Vérifie auth, `amount ≥ 500`, solde ≥ `fedapay_amount`, pas de retrait du jour, opérateur supporté. Calcule `fedapay_amount/fee` via `reverseFedapayPayoutAmount`. Génère `merchant_reference = 'GB-PAYOUT-' + crypto.randomUUID()`. Insert avec `status='pending_review'`. Si `amount ≥ 100 000` → déclenche Edge Function `notify-admin-payout`. Renvoie le retrait créé. |
| `GET /api/withdrawals` | Liste paginée des retraits du marchand. |
| `GET /api/withdrawals/balance` | Renvoie `{ balance: number }` via `get_merchant_balance`. |
| `POST /api/withdrawals/[id]/cancel` | Marchand annule. Refusé si `status ≠ pending_review`. |

**Admin (vérifie `profiles.is_admin = true`)** :

| Route | Rôle |
|---|---|
| `GET /api/admin/withdrawals` | Liste tous les retraits filtrable par status. |
| `POST /api/admin/withdrawals/[id]/approve` | Appelle Edge Function `approve-payout`. |
| `POST /api/admin/withdrawals/[id]/reject` | Status → `rejected`, stocke `rejection_reason`. |

**Système (signatures/secrets)** :

| Route | Rôle |
|---|---|
| `POST /api/payouts/webhook` | Vérifie HMAC `x-fedapay-signature` avec `FEDAPAY_WEBHOOK_SECRET`. MAJ status par `fedapay_payout_id`. Idempotent (UPDATE ne touche pas les status terminaux). |

**Sécurité commune** :
- Toutes les MAJ DB → client `service_role` (RLS bloque sinon).
- Anti-race au `POST /api/withdrawals` : advisory lock Postgres par `merchant_id` (`pg_advisory_xact_lock(hashtext(merchant_id::text))`) → re-vérifie solde + retrait du jour à l'intérieur de la transaction.
- Routes admin : double check (layout + route).

**Invocation des Edge Functions depuis les routes Next.js** : utiliser le SDK Supabase côté serveur (`supabase.functions.invoke('approve-payout', { body: { withdrawal_id } })`) avec un client initialisé en `SUPABASE_SERVICE_ROLE_KEY`. Pas de fetch HTTP manuel — laisser le SDK gérer l'auth et la sérialisation. L'Edge Function vérifie soit la signature `service_role` (pour les invocations depuis Next.js), soit le header `Authorization: Bearer ${CRON_SECRET}` (pour les invocations depuis pg_cron via `net.http_post`).

### 5. Edge Functions Supabase

**`approve-payout`** (logique partagée admin + cron auto-approve)
- Input : `{ withdrawal_id }`
- `UPDATE withdrawals SET status='sent_to_fedapay', auto_approve_attempts = auto_approve_attempts + 1 WHERE id = ? AND status='pending_review' RETURNING *` → si zéro ligne, no-op (déjà traité).
- `POST /v1/payouts` chez FedaPay avec `merchant_reference` (idempotent côté FedaPay).
- `PUT /v1/payouts/{id}/start` pour déclencher.
- Stocke `fedapay_payout_id`, set `reviewed_at = now()` et `reviewed_by = ?`.
- Si FedaPay renvoie 4xx/5xx : rollback `status='pending_review'` (mais garde `auto_approve_attempts` incrémenté). Au-delà de 3 tentatives, l'auto-approve l'ignore. **L'admin manuel n'est jamais bloqué par ce compteur** — `POST /api/admin/withdrawals/[id]/approve` invoke `approve-payout` sans regarder `auto_approve_attempts` (utile justement pour récupérer les retraits que l'auto-approve a abandonnés).

**`auto-approve-batch`** (déclenché par pg_cron toutes les 1 min)
- Auth via header `Authorization: Bearer ${CRON_SECRET}`.
- `SELECT id FROM withdrawals WHERE status='pending_review' AND amount < 100000 AND auto_approve_attempts < 3`
- Pour chaque id → invoke `approve-payout`.

**`poll-payouts`** (déclenché par pg_cron toutes les 5 min)
- Auth via header `Authorization: Bearer ${CRON_SECRET}`.
- `SELECT id, fedapay_payout_id FROM withdrawals WHERE status IN ('sent_to_fedapay','processing') AND updated_at < now() - interval '2 minutes' AND fedapay_payout_id IS NOT NULL`
- Pour chaque : `GET /v1/payouts/{fedapay_payout_id}` → mappe le status FedaPay → MAJ DB si terminal et différent.

**`notify-admin-payout`** (déclenché par `POST /api/withdrawals` quand `amount ≥ 100 000`)
- Input : `{ withdrawal_id }`
- Lookup retrait + nom marchand.
- `SELECT email FROM auth.users JOIN profiles ON profiles.id = auth.users.id WHERE profiles.is_admin = true`
- Envoi email via Resend (`RESEND_API_KEY`) : sujet « Nouveau retrait à valider — `[montant]` XOF », corps avec lien `/dashboard/admin/withdrawals`.

### 6. UI marchand — `src/app/dashboard/withdrawals/`

**Structure** :
```
/dashboard/withdrawals
├── page.tsx                (server : récupère solde + historique)
└── WithdrawalsClient.tsx   (client : bandeau solde + modal demande + table)
```

**Composants** :

1. **Bandeau solde** (haut de page) : montant gros + sous-titre « Mis à jour à HH:MM » + bouton primaire **« Demander un retrait »** (disabled si solde < 500 ou retrait du jour déjà fait).

2. **Modal « Demander un retrait »** :
   - Champ Montant (input number XOF) + boutons rapides 25%/50%/100% du solde.
   - Affichage simple : « Tu reçois exactement `[amount]` XOF ». **Pas de détail des frais** côté UI marchand.
   - Bloc coordonnées pré-rempli depuis `profiles` (nom, téléphone, pays select, opérateur select dépendant du pays).
   - Note : « Pour les retraits ≥ 100 000 XOF, validation manuelle sous 24h. »
   - Bouton submit « Confirmer la demande » + erreurs inline.

3. **Table historique** : Date · Montant · Coordonnées (téléphone **masqué** : conserver le préfixe pays + 2 derniers chiffres, masquer le reste avec `*`. Ex. `+22996123445` → `+229 ** ** ** 45`) · Opérateur · Statut (badge) · Action.
   - Action : « Annuler » uniquement si `status='pending_review'`.
   - Pagination 10/page identique à `/dashboard/transactions`.
   - Ligne cliquable → drawer détail (motif rejet/échec si applicable).

4. **Sidebar nav** : ajouter entrée « Retraits » avec icône type `hgi-stroke hgi-money-send-square`.

5. **Empty state** : illustration + « Demande ton premier retrait dès que ton solde dépasse 500 XOF. »

**Mapping statuts → badge** :
| Status | Label FR | Couleur |
|---|---|---|
| `pending_review` | En attente | gris (< 100k) ou orange (≥ 100k) |
| `approved` | Approuvé | bleu |
| `rejected` | Refusé | rouge |
| `sent_to_fedapay`, `processing` | En cours | bleu animé |
| `sent` | Envoyé | vert |
| `failed` | Échoué | rouge |
| `cancelled` | Annulé | gris |

### 7. UI admin — `src/app/dashboard/admin/withdrawals/`

**Visibilité** : entrée sidebar « Admin · Retraits » apparaît uniquement si `is_admin = true`. Layout `/dashboard/admin/*` (nouveau) vérifie côté server, `redirect('/dashboard')` sinon.

**Structure** :
```
/dashboard/admin/withdrawals
├── page.tsx                       (server : fetch retraits avec filtre status)
└── AdminWithdrawalsClient.tsx     (client : tabs + table + actions)
```

**Composants** :

1. **Header** : « Retraits — vue admin » + compteur `N en attente`.

2. **Tabs** : `À valider` (`pending_review`, défaut) · `En cours` (`approved/sent_to_fedapay/processing`) · `Terminés` (`sent/failed/rejected/cancelled`) · `Tous`.

3. **Tableau** : Date demande · Marchand (nom + email) · Montant net · Montant débité (`fedapay_amount`) · Coordonnées (téléphone **en clair** côté admin) · Statut · Actions.

4. **Actions** (uniquement sur `pending_review`) :
   - **Approuver** (vert) → modal confirmation → `POST /api/admin/withdrawals/[id]/approve`.
   - **Refuser** (rouge) → modal avec textarea **obligatoire** « Motif du refus » → `POST /api/admin/withdrawals/[id]/reject` avec `rejection_reason`. Le rejet est terminal (pas de revert).

5. **Drawer détail** : `fedapay_payout_id`, `merchant_reference`, timestamps, `failure_reason`, `reviewed_by`. Bouton « Voir profil marchand » désactivé (hors-scope v1).

6. **Empty state** par tab : « Aucun retrait à valider 🎉 » sur À valider.

### 8. Variables d'environnement à ajouter

| Var | Où | Rôle |
|---|---|---|
| `FEDAPAY_WEBHOOK_SECRET` | Next.js `.env.local` | Vérif HMAC du webhook |
| `SUPABASE_SERVICE_ROLE_KEY` | Next.js `.env.local` (probablement déjà présent — à vérifier) | UPDATE des withdrawals |
| `RESEND_API_KEY` | Supabase Edge Function secrets | Email admin |
| `CRON_SECRET` | Supabase setting `app.cron_secret` + Edge Functions secrets | Auth des appels cron |

## Sécurité

- `FEDAPAY_SECRET_KEY` jamais exposé côté client (toujours dans Edge Function ou route serveur).
- RLS Supabase : SELECT marchand-only (sauf admin), INSERT marchand-only sur ses propres retraits, UPDATE bloqué côté client.
- Routes admin : vérification `is_admin` côté layout (UX) + côté route (defense in depth).
- Webhook : signature HMAC SHA256 obligatoire, requête sans signature → 401.
- Cron : header `Authorization: Bearer ${CRON_SECRET}` requis, sinon 401.
- Anti-race au POST : advisory lock Postgres par `merchant_id`.
- Idempotence FedaPay : `merchant_reference` UNIQUE protège contre la double création.
- Phone masking côté marchand uniquement (admin voit en clair pour vérification).

## Erreurs gérées

| Cas | Code | Message |
|---|---|---|
| Pas connecté | 401 | "Non authentifié" |
| Pas admin sur route admin | 403 | "Accès refusé" |
| Solde insuffisant | 400 | "Solde insuffisant" |
| Montant < 500 | 400 | "Montant minimum 500 XOF" |
| Retrait déjà aujourd'hui | 429 | "Un seul retrait par jour" |
| Opérateur non supporté | 400 | "Opérateur non supporté" |
| Cancel sur status non pending_review | 400 | "Annulation impossible" |
| Refus admin sans motif | 400 | "Motif obligatoire" |
| FedaPay 4xx/5xx | (interne) | rollback status, increment `auto_approve_attempts` |
| Webhook signature invalide | 401 | (rejet silencieux) |

## Hors-scope

- Pas de retry automatique sur `failed` (terminal, marchand recrée).
- Pas d'email/SMS marchand (visible dans dashboard).
- Pas de page profil marchand pour l'admin (drawer uniquement).
- Pas de payout cash (uniquement mobile money via FedaPay).
- Pas de table `payout_fee_rates` SQL (constante TS suffit, modifiable + redéploiement).
- Pas de `webhook_logs` (logs Edge Function suffisent).
- Pas de notifications push.

## Fichiers touchés

**Créés** :
- `supabase/migrations/011_add_country_and_admin_to_profiles.sql`
- `supabase/migrations/012_create_withdrawals.sql`
- `supabase/migrations/013_create_balance_function.sql`
- `src/lib/fedapay/fees.ts`
- `src/lib/fedapay/payout-fees.ts`
- `src/app/api/withdrawals/route.ts`
- `src/app/api/withdrawals/balance/route.ts`
- `src/app/api/withdrawals/[id]/cancel/route.ts`
- `src/app/api/admin/withdrawals/route.ts`
- `src/app/api/admin/withdrawals/[id]/approve/route.ts`
- `src/app/api/admin/withdrawals/[id]/reject/route.ts`
- `src/app/api/payouts/webhook/route.ts`
- `src/app/dashboard/withdrawals/page.tsx`
- `src/app/dashboard/withdrawals/WithdrawalsClient.tsx`
- `src/app/dashboard/admin/layout.tsx`
- `src/app/dashboard/admin/withdrawals/page.tsx`
- `src/app/dashboard/admin/withdrawals/AdminWithdrawalsClient.tsx`
- `supabase/functions/approve-payout/index.ts`
- `supabase/functions/auto-approve-batch/index.ts`
- `supabase/functions/poll-payouts/index.ts`
- `supabase/functions/notify-admin-payout/index.ts`

**Modifiés (refactor centralisation frais)** :
- `src/app/api/pay/route.ts`
- `src/components/Pricing.tsx`
- `src/app/dashboard/products/ProductsClient.tsx`
- `src/app/dashboard/Sidebar.tsx` (ajout entrée « Retraits » + entrée « Admin · Retraits » conditionnelle au flag `is_admin`).
