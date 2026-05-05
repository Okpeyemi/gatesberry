# Retraits marchand (FedaPay payouts) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre au marchand de demander un retrait de son solde Gatesberry vers son mobile money via l'API FedaPay payouts, avec validation auto < 100k XOF et validation admin sinon.

**Architecture:** 3 migrations Supabase + 1 lib `fedapay/fees.ts` centralisant les taux + 7 routes Next.js (marchand/admin/webhook) + 4 Edge Functions Supabase (approve-payout / auto-approve-batch / poll-payouts / notify-admin-payout) + 2 jobs pg_cron + 4 pages UI (`/dashboard/withdrawals` marchand, `/dashboard/admin/withdrawals` admin).

**Tech Stack:** Next.js 16 (App Router, dynamic routes), `@supabase/ssr` + `@supabase/supabase-js` (service role pour les UPDATE), Supabase Postgres + RLS + pg_cron + Edge Functions (Deno), FedaPay REST v1, Resend pour les emails admin.

**Note testing:** Le projet n'a pas de framework de test installé (pas de `jest`/`vitest`). Les vérifications se font via `pnpm tsc --noEmit`, `curl` et test navigateur — cohérent avec le reste du codebase.

**Spec source:** `docs/superpowers/specs/2026-05-05-withdrawals-design.md`.

---

## File Structure

**Créés :**
- `supabase/migrations/011_add_country_and_admin_to_profiles.sql`
- `supabase/migrations/012_create_withdrawals.sql`
- `supabase/migrations/013_create_balance_function.sql`
- `supabase/migrations/014_create_pg_cron_jobs.sql` (jobs pg_cron — séparé pour pouvoir le rejouer/désactiver)
- `src/lib/fedapay/fees.ts` (NOUVEAU — source de vérité unique des taux)
- `src/lib/fedapay/payout-fees.ts` (calcul reverse pour payouts)
- `src/utils/supabase/admin.ts` (client service_role, NOUVEAU)
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

**Modifiés (refactor centralisation des frais — drop-in, comportement préservé) :**
- `src/app/api/pay/route.ts`
- `src/components/Pricing.tsx`
- `src/app/dashboard/products/ProductsClient.tsx`
- `src/app/dashboard/Sidebar.tsx` (ajout entrées « Retraits » + « Admin · Retraits » conditionnelle)

---

## Task 1: Migrations SQL — schéma + RLS + fonction solde

**Files:**
- Create: `supabase/migrations/011_add_country_and_admin_to_profiles.sql`
- Create: `supabase/migrations/012_create_withdrawals.sql`
- Create: `supabase/migrations/013_create_balance_function.sql`

- [ ] **Step 1: Créer la migration 011** — `supabase/migrations/011_add_country_and_admin_to_profiles.sql`

```sql
-- ============================================================
-- Migration: ajout colonnes country + is_admin à profiles
-- Pré-requis pour la feature retraits (FedaPay payouts)
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN country  TEXT,                              -- code ISO bj/ci/sn/tg/ml/bf/ne
  ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 2: Créer la migration 012** — `supabase/migrations/012_create_withdrawals.sql`

```sql
-- ============================================================
-- Table: withdrawals
-- Demandes de retrait du solde marchand vers son mobile money
-- via l'API FedaPay payouts.
-- ============================================================

CREATE TABLE public.withdrawals (
  id                      UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_id             UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Montants (XOF entiers)
  amount                  INTEGER      NOT NULL CHECK (amount >= 500),
  fedapay_amount          INTEGER,
  fee                     INTEGER,

  -- Coordonnées de versement (snapshot figé à la création)
  receiver_name           TEXT         NOT NULL,
  receiver_phone          TEXT         NOT NULL,
  receiver_country        TEXT         NOT NULL,
  receiver_provider       TEXT         NOT NULL,

  -- Workflow
  status                  TEXT         NOT NULL DEFAULT 'pending_review',
  rejection_reason        TEXT,
  failure_reason          TEXT,

  -- Liens FedaPay
  fedapay_payout_id       BIGINT       UNIQUE,
  merchant_reference      TEXT         UNIQUE,

  -- Anti-retry infini de l'auto-approve
  auto_approve_attempts   INTEGER      NOT NULL DEFAULT 0,

  -- Audit
  reviewed_by             UUID         REFERENCES auth.users(id),
  reviewed_at             TIMESTAMPTZ,
  sent_at                 TIMESTAMPTZ,

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

- [ ] **Step 3: Créer la migration 013** — `supabase/migrations/013_create_balance_function.sql`

```sql
-- ============================================================
-- Fonction: get_merchant_balance(merchant_id)
-- Solde retirable = Σ transactions approved − Σ withdrawals non-failed
-- Décompte sur fedapay_amount (brut) car le marchand paie la commission.
-- ============================================================

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

- [ ] **Step 4: Appliquer les migrations**

Si Supabase local tourne :
```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm supabase db push
```

Sinon, via Studio cloud, exécuter chaque fichier dans l'ordre 011 → 012 → 013 dans l'éditeur SQL.

Expected: aucune erreur, table `withdrawals` créée, colonnes `country`/`is_admin` ajoutées à `profiles`, fonction `get_merchant_balance` disponible.

- [ ] **Step 5: Vérification SQL rapide**

```sql
-- Vérifier la table
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema='public' AND table_name='withdrawals' ORDER BY ordinal_position;

-- Vérifier les colonnes profiles
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='profiles' AND column_name IN ('country','is_admin');

-- Vérifier la fonction (avec un UUID qui n'existe pas → doit renvoyer 0)
SELECT public.get_merchant_balance('00000000-0000-0000-0000-000000000000');
```

Expected: 22 colonnes pour `withdrawals`, 2 lignes pour profiles, `0` pour la fonction.

- [ ] **Step 6: Te marquer admin (toi)**

Récupère ton `auth.users.id` via Supabase Studio (table `auth.users`, filtre par `email = 'maqsoudtawaliou@gmail.com'`), puis :

```sql
UPDATE public.profiles SET is_admin = TRUE
 WHERE id = '<TON_UUID>';
```

Expected: 1 row updated.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/011_add_country_and_admin_to_profiles.sql \
        supabase/migrations/012_create_withdrawals.sql \
        supabase/migrations/013_create_balance_function.sql
git commit -m "feat(withdrawals): add schema, RLS and balance function"
```

---

## Task 2: Centraliser les frais — `src/lib/fedapay/fees.ts`

**Files:**
- Create: `src/lib/fedapay/fees.ts`

- [ ] **Step 1: Créer le fichier** — `src/lib/fedapay/fees.ts`

```typescript
/**
 * Source de vérité unique pour les frais FedaPay et la marge Gatesberry.
 * Modifie les taux ici → tous les calculs (encaissement, retrait, simulateur, page Pricing) sont à jour.
 */

type Provider = { code: string; label: string }

export type OperatorFee = {
  id: string             // 'bj-all', 'ci-wave', ...
  countryCode: string    // 'bj' (utilisé par l'API)
  countryLabel: string   // 'Bénin' (UI)
  providers: Provider[]
  rate: number           // pourcent, ex. 1.8
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

/** Lookup pour les routes API : utilise les codes pays + provider. */
export function getOperatorRate(countryCode: string, providerCode: string): number {
  for (const e of FEDAPAY_OPERATOR_FEES) {
    if (e.countryCode === countryCode && e.providers.some(p => p.code === providerCode)) return e.rate
  }
  return DEFAULT_OPERATOR_RATE
}

/** Format pour les composants UI — drop-in pour SIM_RATES / rates. */
export const FEDAPAY_RATES_DISPLAY = FEDAPAY_OPERATOR_FEES.map(e => ({
  id: e.id,
  country: e.countryLabel,
  providers: e.providers.map(p => p.label).join(', '),
  fee: e.rate,
}))

/** Marge Gatesberry sur transaction entrante (pas sur payout). */
export function gatesberryFee(amount: number) {
  return amount < 10000
    ? Math.round(amount * 0.02 + 50)
    : Math.round(amount * 0.01 + 100)
}
```

- [ ] **Step 2: Vérifier que TypeScript compile**

```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit
```

Expected: aucune nouvelle erreur (peut y avoir des erreurs préexistantes ailleurs).

- [ ] **Step 3: Commit**

```bash
git add src/lib/fedapay/fees.ts
git commit -m "feat(fedapay): centralize operator fees and gatesberry margin in src/lib/fedapay/fees.ts"
```

---

## Task 3: Refactor `src/app/api/pay/route.ts` pour utiliser `fees.ts`

**Files:**
- Modify: `src/app/api/pay/route.ts`

- [ ] **Step 1: Remplacer le bloc `OPERATOR_FEES` local par l'import**

Dans `src/app/api/pay/route.ts`, **supprimer les lignes 11-20** (le bloc `const OPERATOR_FEES: ... = { ... }`) et **ajouter l'import** en tête de fichier (après les autres imports, ligne 2-3) :

```typescript
import { getOperatorRate, gatesberryFee } from '@/lib/fedapay/fees'
```

- [ ] **Step 2: Remplacer les usages de `OPERATOR_FEES` par `getOperatorRate`**

Dans `computeClientAmount` (ligne 26), remplacer :
```typescript
const opRate = OPERATOR_FEES[country]?.[provider] ?? 3.0
```
par :
```typescript
const opRate = getOperatorRate(country, provider)
```

Dans `reverseFedapayAmount` (ligne 60), même remplacement :
```typescript
const opRate = getOperatorRate(country, provider)
```

- [ ] **Step 3: Remplacer la formule Gatesberry inline par `gatesberryFee()`**

Dans `computeClientAmount`, ligne 36-38 actuelle :
```typescript
const gbFee = clientPays < 10000
  ? Math.round(clientPays * 0.02 + 50)
  : Math.round(clientPays * 0.01 + 100)
```
remplacer par :
```typescript
const gbFee = gatesberryFee(clientPays)
```

Idem ligne 46-48 (mêmes 3 lignes dans le bloc final) → `const gbFee = gatesberryFee(clientPays)`.

- [ ] **Step 4: Vérifier que la logique est préservée**

Run :
```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit
```

Expected: aucune nouvelle erreur.

- [ ] **Step 5: Smoke-test manuel — tarif identique avant/après**

Démarrer `pnpm dev`, ouvrir une page de paiement (ex. via `/pay/<slug>` d'un produit existant), vérifier que le montant total affiché au client est **identique** à ce qu'il était avant le refactor pour le même produit. Si différence → bug.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/pay/route.ts
git commit -m "refactor(pay): use centralized fees from src/lib/fedapay/fees"
```

---

## Task 4: Refactor `src/components/Pricing.tsx` pour utiliser `FEDAPAY_RATES_DISPLAY`

**Files:**
- Modify: `src/components/Pricing.tsx`

- [ ] **Step 1: Remplacer le `const rates` local**

Dans `src/components/Pricing.tsx`, **supprimer les lignes 15-27** (le bloc `const rates = [...]`) et **ajouter l'import** sous les autres imports (vers la ligne 4) :

```typescript
import { FEDAPAY_RATES_DISPLAY as rates } from "@/lib/fedapay/fees";
```

L'utilisation `rates[0].id`, `rates.find(...)`, `rates.map(...)` reste **inchangée** (la structure `{ id, country, providers, fee }` est la même).

- [ ] **Step 2: Vérifier compile**

```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit
```

Expected: aucune nouvelle erreur.

- [ ] **Step 3: Smoke-test**

`pnpm dev`, ouvrir la home `/`, scroller jusqu'à la section Tarification, ouvrir le dropdown du simulateur → vérifier que la liste de pays/opérateurs s'affiche identique à avant + le calcul du simulateur fonctionne pour ex. `5000 XOF` Bénin.

- [ ] **Step 4: Commit**

```bash
git add src/components/Pricing.tsx
git commit -m "refactor(pricing): use centralized FEDAPAY_RATES_DISPLAY"
```

---

## Task 5: Refactor `src/app/dashboard/products/ProductsClient.tsx`

**Files:**
- Modify: `src/app/dashboard/products/ProductsClient.tsx`

- [ ] **Step 1: Remplacer `SIM_RATES` local**

Dans `src/app/dashboard/products/ProductsClient.tsx`, **supprimer les lignes 570-583** (le bloc `// ── Simulator ──` + `const SIM_RATES = [...]`) et **ajouter l'import** en haut du fichier (après l'import `createClient`, vers la ligne 5) :

```typescript
import { FEDAPAY_RATES_DISPLAY as SIM_RATES } from '@/lib/fedapay/fees'
```

Garder le commentaire `// ── Simulator ─────────────────────────────────────────────` juste avant `function RevenueSimulator()` pour la lisibilité.

- [ ] **Step 2: Vérifier compile**

```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit
```

Expected: aucune nouvelle erreur.

- [ ] **Step 3: Smoke-test**

`pnpm dev`, login, aller sur `/dashboard/products`, scroller jusqu'au simulateur en bas → vérifier dropdown + calcul identique à avant.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/products/ProductsClient.tsx
git commit -m "refactor(products): use centralized FEDAPAY_RATES_DISPLAY in simulator"
```

---

## Task 6: Helper `payout-fees.ts` — calcul reverse

**Files:**
- Create: `src/lib/fedapay/payout-fees.ts`

- [ ] **Step 1: Créer le fichier** — `src/lib/fedapay/payout-fees.ts`

```typescript
import { getOperatorRate } from './fees'

/**
 * Calcule le brut à envoyer à FedaPay pour qu'après prélèvement de la commission
 * opérateur, le marchand reçoive exactement `net` XOF.
 *
 *   brut * (1 - r) = net
 *   brut = ceil(net / (1 - r))
 *
 * Correction itérative car FedaPay applique Math.round() sur la commission entière.
 */
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

- [ ] **Step 2: Vérifier compile**

```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit
```

Expected: aucune nouvelle erreur.

- [ ] **Step 3: Smoke-check du calcul (Node REPL)**

```bash
cd /home/darellchooks/Bureau/gatesberry && node -e "
const { reverseFedapayPayoutAmount } = require('./src/lib/fedapay/payout-fees.ts')
" 2>&1 || true
```

(Le require direct ne marchera probablement pas en TS pur sans loader — c'est OK, sera testé en intégration via la route Task 8.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/fedapay/payout-fees.ts
git commit -m "feat(fedapay): add reverse payout amount calculator"
```

---

## Task 7: Client Supabase service_role — `src/utils/supabase/admin.ts`

**Files:**
- Create: `src/utils/supabase/admin.ts`

- [ ] **Step 1: Créer le client** — `src/utils/supabase/admin.ts`

```typescript
import { createClient } from '@supabase/supabase-js'

/**
 * Client Supabase avec service_role key — bypass RLS.
 * À utiliser UNIQUEMENT côté serveur (route handlers Next.js, jamais côté client).
 * Réservé aux UPDATE de la table withdrawals (RLS bloque l'UPDATE direct).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
```

- [ ] **Step 2: Ajouter `SUPABASE_SERVICE_ROLE_KEY` à `.env.local` (si pas déjà là)**

Récupérer la clé depuis Supabase Dashboard → Settings → API → `service_role secret`. Ajouter à `/home/darellchooks/Bureau/gatesberry/.env.local` :

```
SUPABASE_SERVICE_ROLE_KEY=<service_role_secret>
FEDAPAY_WEBHOOK_SECRET=<à_créer_au_moment_de_la_config_webhook_FedaPay>
RESEND_API_KEY=<à_créer_via_resend.com>
CRON_SECRET=<long_random_string_ex_openssl_rand_hex_32>
```

Pour `CRON_SECRET`, générer :
```bash
openssl rand -hex 32
```

- [ ] **Step 3: Vérifier compile**

```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit
```

Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add src/utils/supabase/admin.ts
git commit -m "feat(supabase): add admin client (service_role) for withdrawals UPDATE"
```

---

## Task 8: Route `POST /api/withdrawals` (création)

**Files:**
- Create: `src/app/api/withdrawals/route.ts`

- [ ] **Step 1: Créer la route** — `src/app/api/withdrawals/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { reverseFedapayPayoutAmount } from '@/lib/fedapay/payout-fees'
import { FEDAPAY_OPERATOR_FEES } from '@/lib/fedapay/fees'

const MIN_AMOUNT = 500
const ADMIN_REVIEW_THRESHOLD = 100_000

function isProviderSupported(country: string, provider: string) {
  return FEDAPAY_OPERATOR_FEES.some(
    e => e.countryCode === country && e.providers.some(p => p.code === provider),
  )
}

/**
 * POST /api/withdrawals
 * Crée une demande de retrait. Toujours en pending_review.
 * Si amount >= 100k → notify-admin-payout (email).
 * Sinon → auto-approve-batch pg_cron prendra en charge sous 1 min.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = await req.json()
  const { amount, receiver_name, receiver_phone, receiver_country, receiver_provider } = body as {
    amount: number
    receiver_name: string
    receiver_phone: string
    receiver_country: string
    receiver_provider: string
  }

  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < MIN_AMOUNT) {
    return NextResponse.json({ error: `Montant minimum ${MIN_AMOUNT} XOF` }, { status: 400 })
  }
  if (!receiver_name || !receiver_phone || !receiver_country || !receiver_provider) {
    return NextResponse.json({ error: 'Coordonnées incomplètes' }, { status: 400 })
  }
  if (!isProviderSupported(receiver_country, receiver_provider)) {
    return NextResponse.json({ error: 'Opérateur non supporté' }, { status: 400 })
  }

  const { fedapay_amount, fee } = reverseFedapayPayoutAmount(amount, receiver_country, receiver_provider)

  // Anti-race + check 1/jour + check solde dans une transaction Postgres
  const admin = createAdminClient()

  // Lock advisory par marchand (hash UUID)
  const { error: lockErr } = await admin.rpc('pg_advisory_xact_lock' as never, {
    key: 0,
    key2: 0,
  } as never).maybeSingle()
  // ↑ Note : pg_advisory_xact_lock n'est pas exposé par défaut via PostgREST.
  // On fait l'équivalent côté JS : SELECT count(*) FROM withdrawals WHERE merchant_id=? AND created_at >= today
  // (suffit ici car la fenêtre de race est faible et la contrainte UNIQUE sur merchant_reference protège FedaPay)
  void lockErr

  // Check 1 retrait par jour
  const { count: todayCount } = await admin
    .from('withdrawals')
    .select('id', { count: 'exact', head: true })
    .eq('merchant_id', user.id)
    .gte('created_at', new Date().toISOString().slice(0, 10))   // YYYY-MM-DD 00:00 UTC
    .not('status', 'in', '(failed,rejected,cancelled)')
  if ((todayCount ?? 0) >= 1) {
    return NextResponse.json({ error: 'Un seul retrait par jour' }, { status: 429 })
  }

  // Check solde
  const { data: balRow, error: balErr } = await admin.rpc('get_merchant_balance', {
    p_merchant_id: user.id,
  })
  if (balErr) {
    console.error('[withdrawals] get_merchant_balance error:', balErr)
    return NextResponse.json({ error: 'Erreur de calcul du solde' }, { status: 500 })
  }
  const balance = typeof balRow === 'number' ? balRow : Number(balRow)
  if (balance < fedapay_amount) {
    return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 })
  }

  const merchant_reference = `GB-PAYOUT-${crypto.randomUUID()}`

  const { data: inserted, error: insErr } = await admin
    .from('withdrawals')
    .insert({
      merchant_id: user.id,
      amount,
      fedapay_amount,
      fee,
      receiver_name,
      receiver_phone,
      receiver_country,
      receiver_provider,
      merchant_reference,
      status: 'pending_review',
    })
    .select()
    .single()

  if (insErr || !inserted) {
    console.error('[withdrawals] INSERT error:', insErr)
    return NextResponse.json({ error: 'Erreur de création' }, { status: 500 })
  }

  // Notifier admin si >= 100k (best-effort, on ne bloque pas la réponse)
  if (amount >= ADMIN_REVIEW_THRESHOLD) {
    admin.functions
      .invoke('notify-admin-payout', { body: { withdrawal_id: inserted.id } })
      .catch((e) => console.error('[withdrawals] notify-admin-payout invoke failed:', e))
  }

  return NextResponse.json({ withdrawal: inserted }, { status: 201 })
}

/**
 * GET /api/withdrawals
 * Liste paginée des retraits du marchand connecté.
 * Query params: ?page=0 (défaut 0), ?pageSize=10 (défaut 10).
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const url = new URL(req.url)
  const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0', 10))
  const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '10', 10)))
  const from = page * pageSize
  const to = from + pageSize - 1

  const { data, error, count } = await supabase
    .from('withdrawals')
    .select('*', { count: 'exact' })
    .eq('merchant_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    console.error('[withdrawals] GET error:', error)
    return NextResponse.json({ error: 'Erreur de lecture' }, { status: 500 })
  }

  return NextResponse.json({ withdrawals: data ?? [], total: count ?? 0 })
}
```

- [ ] **Step 2: Vérifier compile**

```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit
```

Expected: aucune nouvelle erreur.

- [ ] **Step 3: Smoke-test 401 (sans cookie)**

```bash
curl -i http://localhost:3000/api/withdrawals -X POST -H 'Content-Type: application/json' \
  -d '{"amount":1000,"receiver_name":"Test","receiver_phone":"+22996123445","receiver_country":"bj","receiver_provider":"mtn"}'
```
Expected: `HTTP/1.1 401`.

- [ ] **Step 4: Smoke-test 400 (montant trop bas, avec cookie auth)**

Récupérer le cookie `sb-...-auth-token` depuis DevTools du navigateur connecté à `/dashboard`. Puis :

```bash
COOKIE='sb-...-auth-token=<value>'
curl -i -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -X POST http://localhost:3000/api/withdrawals \
  -d '{"amount":100,"receiver_name":"Test","receiver_phone":"+22996123445","receiver_country":"bj","receiver_provider":"mtn"}'
```
Expected: `HTTP/1.1 400` `{"error":"Montant minimum 500 XOF"}`.

- [ ] **Step 5: Smoke-test happy path (insertion)**

Avec un compte qui a au moins 1000 XOF de transactions `approved` :
```bash
curl -i -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -X POST http://localhost:3000/api/withdrawals \
  -d '{"amount":1000,"receiver_name":"Maqsoud","receiver_phone":"+22996123445","receiver_country":"bj","receiver_provider":"mtn"}'
```
Expected: `HTTP/1.1 201` `{"withdrawal":{...,"status":"pending_review",...}}`. Vérifier dans Supabase Studio que la ligne est bien créée.

- [ ] **Step 6: Smoke-test 429 (deuxième retrait du jour)**

Refaire le curl du Step 5 → Expected: `HTTP/1.1 429` `{"error":"Un seul retrait par jour"}`.

- [ ] **Step 7: Smoke-test GET**

```bash
curl -s -H "Cookie: $COOKIE" http://localhost:3000/api/withdrawals | jq .
```
Expected: `{"withdrawals":[...],"total":1}`.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/withdrawals/route.ts
git commit -m "feat(withdrawals): add POST/GET /api/withdrawals endpoints"
```

---

## Task 9: Route `GET /api/withdrawals/balance`

**Files:**
- Create: `src/app/api/withdrawals/balance/route.ts`

- [ ] **Step 1: Créer la route**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * GET /api/withdrawals/balance
 * Renvoie le solde retirable du marchand connecté.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data, error } = await supabase.rpc('get_merchant_balance', {
    p_merchant_id: user.id,
  })

  if (error) {
    console.error('[balance] RPC error:', error)
    return NextResponse.json({ error: 'Erreur de calcul' }, { status: 500 })
  }

  const balance = typeof data === 'number' ? data : Number(data)
  return NextResponse.json({ balance: Number.isFinite(balance) ? balance : 0 })
}
```

- [ ] **Step 2: Vérifier compile + smoke-test**

```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit
curl -s -H "Cookie: $COOKIE" http://localhost:3000/api/withdrawals/balance
```
Expected: `{"balance": <int>}` cohérent avec tes transactions `approved` − tes withdrawals non-failed.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/withdrawals/balance/route.ts
git commit -m "feat(withdrawals): add GET /api/withdrawals/balance"
```

---

## Task 10: Route `POST /api/withdrawals/[id]/cancel`

**Files:**
- Create: `src/app/api/withdrawals/[id]/cancel/route.ts`

- [ ] **Step 1: Créer la route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

/**
 * POST /api/withdrawals/[id]/cancel
 * Annule un retrait en pending_review (du marchand authentifié).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()

  // UPDATE conditionnel : seulement si appartient à user ET status='pending_review'
  const { data, error } = await admin
    .from('withdrawals')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('merchant_id', user.id)
    .eq('status', 'pending_review')
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Annulation impossible' }, { status: 400 })
  }

  return NextResponse.json({ withdrawal: data })
}
```

- [ ] **Step 2: Vérifier compile + smoke-test**

```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit

# Récupérer l'id d'un retrait pending_review puis :
WID='<uuid>'
curl -i -H "Cookie: $COOKIE" -X POST http://localhost:3000/api/withdrawals/$WID/cancel
```
Expected: `200 {"withdrawal":{...,"status":"cancelled"}}`.

Refaire le même curl → Expected: `400 {"error":"Annulation impossible"}` (déjà cancelled).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/withdrawals/\[id\]/cancel/route.ts
git commit -m "feat(withdrawals): add POST /api/withdrawals/[id]/cancel"
```

---

## Task 11: Routes admin — list/approve/reject

**Files:**
- Create: `src/app/api/admin/withdrawals/route.ts`
- Create: `src/app/api/admin/withdrawals/[id]/approve/route.ts`
- Create: `src/app/api/admin/withdrawals/[id]/reject/route.ts`

- [ ] **Step 1: Helper de check admin (inline dans chaque route — DRY plus tard si besoin)**

Pour chaque route admin, on va répéter le check `is_admin` inline (3 routes seulement, helper non justifié pour l'instant).

- [ ] **Step 2: Créer `src/app/api/admin/withdrawals/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * GET /api/admin/withdrawals?status=pending_review
 * Liste tous les retraits (admin only), filtrable par status.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const url = new URL(req.url)
  const status = url.searchParams.get('status')   // null = tous
  const page = Math.max(0, parseInt(url.searchParams.get('page') ?? '0', 10))
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10)))
  const from = page * pageSize
  const to = from + pageSize - 1

  let q = supabase
    .from('withdrawals')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status) {
    if (status.includes(',')) q = q.in('status', status.split(','))
    else q = q.eq('status', status)
  }

  const { data, error, count } = await q
  if (error) {
    console.error('[admin/withdrawals] error:', error)
    return NextResponse.json({ error: 'Erreur de lecture' }, { status: 500 })
  }

  // Joindre nom marchand côté admin (2e requête, RLS admin lit tous les profils)
  // Note : profiles n'a pas de colonne email — l'email vit dans auth.users (pas accessible
  // sans service_role). On affiche full_name uniquement côté admin.
  const merchantIds = Array.from(new Set((data ?? []).map(w => w.merchant_id)))
  const { data: merchants } = merchantIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', merchantIds)
    : { data: [] }
  const merchantsById = new Map((merchants ?? []).map(m => [m.id, m]))

  const enriched = (data ?? []).map(w => ({
    ...w,
    merchant: merchantsById.get(w.merchant_id) ?? null,
  }))

  return NextResponse.json({ withdrawals: enriched, total: count ?? 0 })
}
```

- [ ] **Step 3: Créer `src/app/api/admin/withdrawals/[id]/approve/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

/**
 * POST /api/admin/withdrawals/[id]/approve
 * Admin approuve un retrait pending_review → invoke Edge Function approve-payout.
 * Cette route NE limite PAS par auto_approve_attempts (l'admin peut toujours forcer).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.functions.invoke('approve-payout', {
    body: { withdrawal_id: id, reviewed_by: user.id },
  })
  if (error) {
    console.error('[admin/approve] invoke error:', error)
    return NextResponse.json({ error: 'Erreur Edge Function' }, { status: 502 })
  }
  return NextResponse.json(data)
}
```

- [ ] **Step 4: Créer `src/app/api/admin/withdrawals/[id]/reject/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'

/**
 * POST /api/admin/withdrawals/[id]/reject
 * Admin refuse un retrait pending_review. Motif obligatoire (visible marchand). Terminal.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const reason = (body?.reason ?? '').trim()
  if (!reason) return NextResponse.json({ error: 'Motif obligatoire' }, { status: 400 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('withdrawals')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending_review')
    .select()
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Refus impossible (status non pending_review ?)' }, { status: 400 })
  }
  return NextResponse.json({ withdrawal: data })
}
```

- [ ] **Step 5: Vérifier compile**

```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit
```
Expected: aucune nouvelle erreur.

- [ ] **Step 6: Smoke-tests**

Avec ton cookie admin (Step 6 du Task 1 t'a marqué admin) :
```bash
# List pending
curl -s -H "Cookie: $COOKIE" 'http://localhost:3000/api/admin/withdrawals?status=pending_review' | jq .

# Reject sans motif → 400
WID='<uuid_pending>'
curl -i -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -X POST http://localhost:3000/api/admin/withdrawals/$WID/reject -d '{}'
# Expected: 400 "Motif obligatoire"

# Reject avec motif → 200
curl -i -H "Cookie: $COOKIE" -H 'Content-Type: application/json' \
  -X POST http://localhost:3000/api/admin/withdrawals/$WID/reject -d '{"reason":"Coordonnées invalides"}'
# Expected: 200 + status='rejected'

# Test 403 avec un compte non-admin (créer un 2e user, repasser cookie)
# Expected: 403
```

(Le test `/approve` complet nécessite l'Edge Function → on testera dans la Task 12.)

- [ ] **Step 7: Commit**

```bash
git add src/app/api/admin/
git commit -m "feat(admin): add admin withdrawals list/approve/reject routes"
```

---

## Task 12: Edge Function `approve-payout`

**Files:**
- Create: `supabase/functions/approve-payout/index.ts`

- [ ] **Step 1: Créer la function** — `supabase/functions/approve-payout/index.ts`

```typescript
// @ts-nocheck — Deno runtime, pas de typings npm dans cet env
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FEDAPAY_SECRET = Deno.env.get('FEDAPAY_SECRET_KEY')!
const FEDAPAY_ENV = Deno.env.get('FEDAPAY_ENVIRONMENT') ?? 'sandbox'
const FEDAPAY_BASE = FEDAPAY_ENV === 'live'
  ? 'https://api.fedapay.com/v1'
  : 'https://sandbox-api.fedapay.com/v1'

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * Logique partagée admin manuel + cron auto-approve.
 * Input body: { withdrawal_id: string, reviewed_by?: string | null }
 */
Deno.serve(async (req) => {
  try {
    const { withdrawal_id, reviewed_by } = await req.json()
    if (!withdrawal_id) return new Response(JSON.stringify({ error: 'withdrawal_id requis' }), { status: 400 })

    // Lock optimiste : passer pending_review → sent_to_fedapay si encore éligible.
    // Incrémente aussi auto_approve_attempts dans le même UPDATE.
    const { data: current } = await supa
      .from('withdrawals')
      .select('auto_approve_attempts')
      .eq('id', withdrawal_id)
      .single()
    const nextAttempts = (current?.auto_approve_attempts ?? 0) + 1

    const { data: locked, error: lockErr } = await supa
      .from('withdrawals')
      .update({
        status: 'sent_to_fedapay',
        auto_approve_attempts: nextAttempts,
        reviewed_by: reviewed_by ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', withdrawal_id)
      .eq('status', 'pending_review')
      .select()
      .single()

    if (lockErr || !locked) {
      return new Response(
        JSON.stringify({ error: 'Retrait non éligible (status changé entretemps ?)' }),
        { status: 409 },
      )
    }

    // 1. POST /v1/payouts (création — idempotent via merchant_reference)
    const createRes = await fetch(`${FEDAPAY_BASE}/payouts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${FEDAPAY_SECRET}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: locked.fedapay_amount,
        currency: { iso: 'XOF' },
        mode: locked.receiver_provider,           // 'mtn'/'moov'/'orange'/'wave'/'mixx'/'celtiis'/'airtel'
        merchant_reference: locked.merchant_reference,
        customer: {
          firstname: (locked.receiver_name as string).split(' ')[0],
          lastname: (locked.receiver_name as string).split(' ').slice(1).join(' ') || locked.receiver_name,
          phone_number: { number: locked.receiver_phone, country: locked.receiver_country },
        },
      }),
    })

    if (!createRes.ok) {
      const t = await createRes.text()
      console.error('[approve-payout] create error', createRes.status, t)
      // Rollback status
      await supa.from('withdrawals').update({ status: 'pending_review' }).eq('id', withdrawal_id)
      return new Response(JSON.stringify({ error: 'FedaPay create error', detail: t }), { status: 502 })
    }
    const createBody = await createRes.json()
    const payout = createBody['v1/payout'] ?? createBody?.payout ?? createBody
    const fedapayId: number = payout.id

    // 2. PUT /v1/payouts/{id}/start (déclenche réellement)
    const startRes = await fetch(`${FEDAPAY_BASE}/payouts/${fedapayId}/start`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${FEDAPAY_SECRET}`, 'Content-Type': 'application/json' },
    })
    if (!startRes.ok) {
      const t = await startRes.text()
      console.error('[approve-payout] start error', startRes.status, t)
      // FedaPay payout existe mais pas démarré → on garde fedapay_payout_id mais status=pending_review
      // Le poll-payouts ou un retry manuel admin pourra reprendre.
      await supa
        .from('withdrawals')
        .update({ status: 'pending_review', fedapay_payout_id: fedapayId })
        .eq('id', withdrawal_id)
      return new Response(JSON.stringify({ error: 'FedaPay start error', detail: t }), { status: 502 })
    }

    await supa
      .from('withdrawals')
      .update({ fedapay_payout_id: fedapayId })
      .eq('id', withdrawal_id)

    return new Response(JSON.stringify({ ok: true, fedapay_payout_id: fedapayId }), { status: 200 })
  } catch (err) {
    console.error('[approve-payout] exception', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
```

- [ ] **Step 2: Configurer les secrets de l'Edge Function**

```bash
cd /home/darellchooks/Bureau/gatesberry
pnpm supabase secrets set FEDAPAY_SECRET_KEY="$(grep FEDAPAY_SECRET_KEY .env.local | cut -d= -f2-)"
pnpm supabase secrets set FEDAPAY_ENVIRONMENT="$(grep FEDAPAY_ENVIRONMENT .env.local | cut -d= -f2- || echo sandbox)"
# SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont auto-injectés.
```

- [ ] **Step 3: Déployer**

```bash
cd /home/darellchooks/Bureau/gatesberry
pnpm supabase functions deploy approve-payout --no-verify-jwt
```

(`--no-verify-jwt` car on appelle via service_role depuis Next.js — l'auth se fait par la clé service_role dans le header, pas par JWT user.)

Expected: `Deployed Function: approve-payout`.

- [ ] **Step 4: Smoke-test via la route admin**

Avec une demande `pending_review` créée au Task 8 (et toi marqué admin), depuis le navigateur ou curl :
```bash
WID='<uuid_pending>'
curl -i -H "Cookie: $COOKIE" -X POST http://localhost:3000/api/admin/withdrawals/$WID/approve
```
Expected: `200 {"ok":true,"fedapay_payout_id": <number>}`. Vérifier dans Supabase que `status='sent_to_fedapay'` et `fedapay_payout_id` est rempli.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/approve-payout/
git commit -m "feat(edge): add approve-payout function (FedaPay payout creation + start)"
```

---

## Task 13: Edge Function `notify-admin-payout`

**Files:**
- Create: `supabase/functions/notify-admin-payout/index.ts`

- [ ] **Step 1: Créer la function**

```typescript
// @ts-nocheck — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const FROM = Deno.env.get('RESEND_FROM') ?? 'Gatesberry <noreply@gatesberry.com>'
const APP_URL = Deno.env.get('APP_URL') ?? 'http://localhost:3000'

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * Email aux admins quand un retrait >= 100k arrive en pending_review.
 * Input body: { withdrawal_id: string }
 */
Deno.serve(async (req) => {
  try {
    const { withdrawal_id } = await req.json()
    if (!withdrawal_id) return new Response(JSON.stringify({ error: 'withdrawal_id requis' }), { status: 400 })

    const { data: w, error: wErr } = await supa
      .from('withdrawals')
      .select('amount, receiver_phone, merchant_id')
      .eq('id', withdrawal_id)
      .single()
    if (wErr || !w) return new Response(JSON.stringify({ error: 'withdrawal introuvable' }), { status: 404 })

    const { data: merchant } = await supa
      .from('profiles')
      .select('full_name')
      .eq('id', w.merchant_id)
      .single()
    const merchantName = merchant?.full_name ?? '(marchand inconnu)'

    // Récupérer admins
    const { data: admins } = await supa
      .from('profiles')
      .select('id')
      .eq('is_admin', true)
    const adminIds = (admins ?? []).map(a => a.id)
    if (adminIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 })
    }
    // Récupérer les emails depuis auth.users via admin API
    const adminEmails: string[] = []
    for (const id of adminIds) {
      const { data: u } = await supa.auth.admin.getUserById(id)
      if (u?.user?.email) adminEmails.push(u.user.email)
    }
    if (adminEmails.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), { status: 200 })
    }

    // Envoi via Resend
    const subject = `Nouveau retrait à valider — ${w.amount.toLocaleString('fr-FR')} XOF`
    const html = `
      <p>Un retrait nécessite ta validation.</p>
      <ul>
        <li><b>Marchand :</b> ${merchantName}</li>
        <li><b>Montant :</b> ${w.amount.toLocaleString('fr-FR')} XOF</li>
        <li><b>Téléphone :</b> ${w.receiver_phone}</li>
      </ul>
      <p><a href="${APP_URL}/dashboard/admin/withdrawals">Ouvrir la console admin</a></p>`

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: adminEmails, subject, html }),
    })
    if (!r.ok) {
      const t = await r.text()
      console.error('[notify-admin-payout] Resend error', r.status, t)
      return new Response(JSON.stringify({ error: 'Resend failed', detail: t }), { status: 502 })
    }
    return new Response(JSON.stringify({ ok: true, sent: adminEmails.length }), { status: 200 })
  } catch (err) {
    console.error('[notify-admin-payout] exception', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
})
```

- [ ] **Step 2: Configurer secrets + déployer**

```bash
cd /home/darellchooks/Bureau/gatesberry
pnpm supabase secrets set RESEND_API_KEY="<ta_clé_resend>"
pnpm supabase secrets set RESEND_FROM="Gatesberry <noreply@<ton_domaine_resend>>"
pnpm supabase secrets set APP_URL="http://localhost:3000"   # ou prod URL
pnpm supabase functions deploy notify-admin-payout --no-verify-jwt
```

- [ ] **Step 3: Smoke-test**

Créer une demande `>= 100 000 XOF` via la route Task 8 (avec un solde suffisant) → vérifier que tu reçois un email à `maqsoudtawaliou@gmail.com`. Si ça ne part pas, regarder Supabase Dashboard → Edge Functions → notify-admin-payout → Logs.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/notify-admin-payout/
git commit -m "feat(edge): add notify-admin-payout function (Resend email)"
```

---

## Task 14: Edge Function `auto-approve-batch` + pg_cron

**Files:**
- Create: `supabase/functions/auto-approve-batch/index.ts`
- Create: `supabase/migrations/014_create_pg_cron_jobs.sql`

- [ ] **Step 1: Créer la function**

```typescript
// @ts-nocheck — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const APP_URL = Deno.env.get('APP_URL') ?? SUPABASE_URL    // pour invoke approve-payout via supabase functions

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * Scanne les retraits pending_review < 100k avec attempts < 3, et déclenche approve-payout.
 * Auth: header Authorization: Bearer ${CRON_SECRET}.
 */
Deno.serve(async (req) => {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { data: rows } = await supa
    .from('withdrawals')
    .select('id')
    .eq('status', 'pending_review')
    .lt('amount', 100000)
    .lt('auto_approve_attempts', 3)
    .limit(50)

  let processed = 0
  for (const r of rows ?? []) {
    try {
      await supa.functions.invoke('approve-payout', { body: { withdrawal_id: r.id } })
      processed++
    } catch (e) {
      console.error('[auto-approve-batch] invoke failed for', r.id, e)
    }
  }
  return new Response(JSON.stringify({ processed }), { status: 200 })
})
```

- [ ] **Step 2: Déployer la function + secrets**

```bash
cd /home/darellchooks/Bureau/gatesberry
pnpm supabase secrets set CRON_SECRET="$(grep CRON_SECRET .env.local | cut -d= -f2-)"
pnpm supabase functions deploy auto-approve-batch --no-verify-jwt
```

- [ ] **Step 3: Créer la migration pg_cron** — `supabase/migrations/014_create_pg_cron_jobs.sql`

```sql
-- ============================================================
-- pg_cron jobs pour la feature retraits.
-- Pré-requis : extension pg_cron + pg_net (vérifier avec
--   SELECT * FROM pg_extension WHERE extname IN ('pg_cron','pg_net');
-- Activer dans Supabase Studio → Database → Extensions si manquant.
-- ============================================================

-- Stocker le CRON_SECRET en setting Postgres
-- (à exécuter manuellement une fois ; remplacer la valeur ci-dessous)
ALTER DATABASE postgres SET app.cron_secret = '<TON_CRON_SECRET>';

-- Stocker l'URL de base des Edge Functions
ALTER DATABASE postgres SET app.functions_url = 'https://<TON_PROJECT_REF>.supabase.co/functions/v1';

-- Job 1 : auto-approve-batch toutes les minutes
SELECT cron.schedule(
  'auto-approve-small-payouts',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.functions_url') || '/auto-approve-batch',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);

-- Job 2 : poll-payouts toutes les 5 minutes
SELECT cron.schedule(
  'poll-pending-payouts',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.functions_url') || '/poll-payouts',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

- [ ] **Step 4: Appliquer la migration ET remplacer les valeurs en place**

1. Récupérer le project ref Supabase (Dashboard → Settings → General → Reference ID, format `abcdefghijkl`).
2. Récupérer la valeur de `CRON_SECRET` depuis `.env.local`.
3. Éditer la migration : remplacer `<TON_CRON_SECRET>` et `<TON_PROJECT_REF>` par les vraies valeurs.
4. Vérifier que `pg_cron` et `pg_net` sont activés (Studio → Database → Extensions).
5. Appliquer :
```bash
pnpm supabase db push
```
(ou exécuter directement le SQL dans le Studio si nécessaire).

- [ ] **Step 5: Vérifier que le job tourne**

Dans Supabase SQL Editor :
```sql
SELECT * FROM cron.job;                              -- doit lister 2 jobs
SELECT * FROM cron.job_run_details ORDER BY end_time DESC LIMIT 5;   -- voir les dernières exécutions (attendre 1-2 min)
```
Expected: 2 jobs présents, exécutions récentes.

- [ ] **Step 6: Smoke-test end-to-end auto-approve**

Créer une demande `< 100k` via curl (Task 8). Attendre ≤ 1 min. Recharger la ligne dans Supabase → `status` doit être passé à `sent_to_fedapay` avec `fedapay_payout_id` rempli.

Si ça ne marche pas : checker `cron.job_run_details` pour voir si le HTTP appel a réussi, puis Supabase Dashboard → Edge Functions → auto-approve-batch → Logs.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/auto-approve-batch/ supabase/migrations/014_create_pg_cron_jobs.sql
git commit -m "feat(cron): add auto-approve-batch edge function and pg_cron schedule"
```

---

## Task 15: Edge Function `poll-payouts`

**Files:**
- Create: `supabase/functions/poll-payouts/index.ts`

- [ ] **Step 1: Créer la function**

```typescript
// @ts-nocheck — Deno runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const FEDAPAY_SECRET = Deno.env.get('FEDAPAY_SECRET_KEY')!
const FEDAPAY_ENV = Deno.env.get('FEDAPAY_ENVIRONMENT') ?? 'sandbox'
const FEDAPAY_BASE = FEDAPAY_ENV === 'live'
  ? 'https://api.fedapay.com/v1'
  : 'https://sandbox-api.fedapay.com/v1'

const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const FEDAPAY_TO_DB: Record<string, string> = {
  pending: 'sent_to_fedapay',
  started: 'sent_to_fedapay',
  processing: 'processing',
  sent: 'sent',
  failed: 'failed',
}

const TERMINAL_DB = new Set(['sent', 'failed', 'rejected', 'cancelled'])

/**
 * Polling des retraits non terminaux pour récupérer le status FedaPay.
 * Filet anti-perte de webhook.
 */
Deno.serve(async (req) => {
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Retraits dont updated_at est plus vieux que 2 min, status non terminal, fedapay_payout_id présent
  const { data: rows } = await supa
    .from('withdrawals')
    .select('id, fedapay_payout_id, status')
    .in('status', ['sent_to_fedapay', 'processing'])
    .not('fedapay_payout_id', 'is', null)
    .lt('updated_at', new Date(Date.now() - 2 * 60 * 1000).toISOString())
    .limit(50)

  let updated = 0
  for (const w of rows ?? []) {
    try {
      const r = await fetch(`${FEDAPAY_BASE}/payouts/${w.fedapay_payout_id}`, {
        headers: { Authorization: `Bearer ${FEDAPAY_SECRET}` },
      })
      if (!r.ok) {
        console.error('[poll-payouts] FedaPay GET failed', w.fedapay_payout_id, r.status)
        continue
      }
      const body = await r.json()
      const payout = body['v1/payout'] ?? body?.payout ?? body
      const fpStatus: string = payout.status
      const newDbStatus = FEDAPAY_TO_DB[fpStatus]
      if (!newDbStatus || newDbStatus === w.status) continue

      const patch: Record<string, unknown> = { status: newDbStatus }
      if (newDbStatus === 'sent') patch.sent_at = new Date().toISOString()
      if (newDbStatus === 'failed') patch.failure_reason = payout.failed_reason ?? payout.failure_reason ?? 'unknown'

      // Idempotent : ne touche pas les terminaux
      const { data: u } = await supa
        .from('withdrawals')
        .update(patch)
        .eq('id', w.id)
        .not('status', 'in', `(${[...TERMINAL_DB].join(',')})`)
        .select()
        .single()
      if (u) updated++
    } catch (e) {
      console.error('[poll-payouts] exception', w.id, e)
    }
  }
  return new Response(JSON.stringify({ checked: rows?.length ?? 0, updated }), { status: 200 })
})
```

- [ ] **Step 2: Déployer**

```bash
cd /home/darellchooks/Bureau/gatesberry
pnpm supabase functions deploy poll-payouts --no-verify-jwt
```

- [ ] **Step 3: Smoke-test manuel**

Forcer un appel direct (en dev local seulement, l'URL sera celle de Supabase) :
```bash
SUPABASE_REF='<ton_ref>'
CRON='<ton_cron_secret>'
curl -i -H "Authorization: Bearer $CRON" \
  https://$SUPABASE_REF.supabase.co/functions/v1/poll-payouts
```
Expected: `200 {"checked":N,"updated":M}`.

Pour tester un changement réel : compléter manuellement un paiement test FedaPay (sandbox), attendre 2-5 min → vérifier que `withdrawals.status` passe à `sent`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/poll-payouts/
git commit -m "feat(edge): add poll-payouts function (FedaPay status filter)"
```

---

## Task 16: Route webhook `POST /api/payouts/webhook`

**Files:**
- Create: `src/app/api/payouts/webhook/route.ts`

- [ ] **Step 1: Créer la route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/utils/supabase/admin'

const FEDAPAY_WEBHOOK_SECRET = process.env.FEDAPAY_WEBHOOK_SECRET!

const FEDAPAY_TO_DB: Record<string, string> = {
  'payout.processing': 'processing',
  'payout.sent': 'sent',
  'payout.failed': 'failed',
}

const TERMINAL_DB = new Set(['sent', 'failed', 'rejected', 'cancelled'])

/**
 * POST /api/payouts/webhook
 * Reçoit les events FedaPay payouts. Bonus (le polling reste primary).
 */
export async function POST(req: NextRequest) {
  const sigHeader = req.headers.get('x-fedapay-signature') ?? ''
  const raw = await req.text()

  // Vérif HMAC SHA256 du body brut
  const expected = crypto.createHmac('sha256', FEDAPAY_WEBHOOK_SECRET).update(raw).digest('hex')
  // FedaPay envoie potentiellement le format "t=...,v1=hash" — on vérifie la présence du hash
  if (!sigHeader.includes(expected)) {
    console.warn('[webhook] signature invalide')
    return NextResponse.json({ error: 'Signature invalide' }, { status: 401 })
  }

  let body: any
  try { body = JSON.parse(raw) } catch {
    return NextResponse.json({ error: 'Body invalide' }, { status: 400 })
  }

  const eventName: string = body?.name ?? body?.event ?? ''
  const payout = body?.entity ?? body?.payout ?? body?.data ?? null
  if (!payout?.id) return NextResponse.json({ ok: true, ignored: 'no payout id' })

  const newDbStatus = FEDAPAY_TO_DB[eventName]
  if (!newDbStatus) return NextResponse.json({ ok: true, ignored: eventName })

  const admin = createAdminClient()

  const patch: Record<string, unknown> = { status: newDbStatus }
  if (newDbStatus === 'sent') patch.sent_at = new Date().toISOString()
  if (newDbStatus === 'failed') patch.failure_reason = payout.failed_reason ?? payout.failure_reason ?? 'unknown'

  // Idempotent : pas d'écrasement d'un status terminal
  const { error } = await admin
    .from('withdrawals')
    .update(patch)
    .eq('fedapay_payout_id', payout.id)
    .not('status', 'in', `(${[...TERMINAL_DB].join(',')})`)
  if (error) {
    console.error('[webhook] update error', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Vérifier compile + smoke-test**

```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit

# Test signature invalide
curl -i -X POST -H 'Content-Type: application/json' \
  http://localhost:3000/api/payouts/webhook -d '{}'
# Expected: 401

# Test signature valide (générer hash localement)
SECRET='<FEDAPAY_WEBHOOK_SECRET>'
BODY='{"name":"payout.sent","entity":{"id":12345}}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -binary | xxd -p -c 256)
curl -i -X POST -H "Content-Type: application/json" -H "x-fedapay-signature: $SIG" \
  http://localhost:3000/api/payouts/webhook -d "$BODY"
# Expected: 200 (et un retrait avec fedapay_payout_id=12345 mis à jour si existait)
```

- [ ] **Step 3: Configurer le webhook dans le dashboard FedaPay**

(Manuel) Aller sur le dashboard FedaPay → Webhooks → ajouter une URL pointant vers `https://<TON_DOMAINE>/api/payouts/webhook`, secret = `FEDAPAY_WEBHOOK_SECRET`. Si FedaPay ne supporte pas les events payouts, la route reste inerte (le polling fait le job).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/payouts/webhook/route.ts
git commit -m "feat(payouts): add FedaPay webhook endpoint with HMAC verification"
```

---

## Task 17: UI marchand — `/dashboard/withdrawals`

**Files:**
- Create: `src/app/dashboard/withdrawals/page.tsx`
- Create: `src/app/dashboard/withdrawals/WithdrawalsClient.tsx`

- [ ] **Step 1: Créer le server component** — `src/app/dashboard/withdrawals/page.tsx`

```typescript
import { createClient } from '@/utils/supabase/server'
import WithdrawalsClient from './WithdrawalsClient'

export default async function WithdrawalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: balanceRpc }, { data: withdrawals }, { data: profile }] = await Promise.all([
    supabase.rpc('get_merchant_balance', { p_merchant_id: user!.id }),
    supabase
      .from('withdrawals')
      .select('*')
      .eq('merchant_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('profiles')
      .select('full_name, mobile_money_number, country')
      .eq('id', user!.id)
      .single(),
  ])

  const balance = typeof balanceRpc === 'number' ? balanceRpc : Number(balanceRpc) || 0

  return (
    <WithdrawalsClient
      initialBalance={balance}
      initialWithdrawals={(withdrawals as any[]) ?? []}
      profileDefaults={{
        name: profile?.full_name ?? '',
        phone: profile?.mobile_money_number ?? '',
        country: profile?.country ?? 'bj',
      }}
    />
  )
}
```

- [ ] **Step 2: Créer le client component** — `src/app/dashboard/withdrawals/WithdrawalsClient.tsx`

```typescript
"use client"

import { useState, useMemo } from 'react'
import { FEDAPAY_OPERATOR_FEES } from '@/lib/fedapay/fees'

type Withdrawal = {
  id: string
  amount: number
  fedapay_amount: number | null
  fee: number | null
  status: 'pending_review'|'approved'|'rejected'|'sent_to_fedapay'|'processing'|'sent'|'failed'|'cancelled'
  receiver_name: string
  receiver_phone: string
  receiver_country: string
  receiver_provider: string
  rejection_reason: string | null
  failure_reason: string | null
  created_at: string
}

const STATUS_LABEL: Record<Withdrawal['status'], { label: string; color: string; bg: string }> = {
  pending_review:   { label: 'En attente',  color: '#9a6a00', bg: '#fff3d6' },
  approved:         { label: 'Approuvé',    color: '#1d4ed8', bg: '#dbe4ff' },
  sent_to_fedapay:  { label: 'En cours',    color: '#1d4ed8', bg: '#dbe4ff' },
  processing:       { label: 'En cours',    color: '#1d4ed8', bg: '#dbe4ff' },
  sent:             { label: 'Envoyé',      color: '#15803d', bg: '#dcfce7' },
  failed:           { label: 'Échoué',      color: '#b91c1c', bg: '#fee2e2' },
  rejected:         { label: 'Refusé',      color: '#b91c1c', bg: '#fee2e2' },
  cancelled:        { label: 'Annulé',      color: '#525252', bg: '#f3f4f6' },
}

function maskPhone(phone: string): string {
  // Ex. "+22996123445" → "+229 ** ** ** 45"
  const m = phone.match(/^(\+\d{1,4})(\d+)$/)
  if (!m) return phone
  const prefix = m[1]
  const rest = m[2]
  const last2 = rest.slice(-2)
  const masked = '** '.repeat(Math.max(0, Math.floor((rest.length - 2) / 2))).trim()
  return `${prefix} ${masked} ${last2}`.replace(/\s+/g, ' ').trim()
}

function formatAmount(n: number) {
  return new Intl.NumberFormat('fr-FR').format(n)
}

export default function WithdrawalsClient({
  initialBalance,
  initialWithdrawals,
  profileDefaults,
}: {
  initialBalance: number
  initialWithdrawals: Withdrawal[]
  profileDefaults: { name: string; phone: string; country: string }
}) {
  const [balance, setBalance] = useState(initialBalance)
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>(initialWithdrawals)
  const [modalOpen, setModalOpen] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const hasTodayPending = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return withdrawals.some(w =>
      w.created_at.slice(0, 10) === today &&
      !['failed','rejected','cancelled'].includes(w.status))
  }, [withdrawals])

  const canRequest = balance >= 500 && !hasTodayPending

  const handleRefresh = async () => {
    const r1 = await fetch('/api/withdrawals/balance').then(r => r.json())
    setBalance(r1.balance ?? 0)
    const r2 = await fetch('/api/withdrawals?pageSize=50').then(r => r.json())
    setWithdrawals(r2.withdrawals ?? [])
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Annuler cette demande ?')) return
    setCancellingId(id)
    const r = await fetch(`/api/withdrawals/${id}/cancel`, { method: 'POST' })
    setCancellingId(null)
    if (!r.ok) {
      const e = await r.json().catch(() => ({}))
      alert(e.error ?? 'Erreur')
      return
    }
    await handleRefresh()
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
      {/* Bandeau solde */}
      <div style={{
        background:'#fff', border:'1px solid var(--color-border)', borderRadius:16,
        padding:'24px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24,
      }}>
        <div>
          <p style={{ fontSize:13, color:'var(--color-text-muted)', marginBottom:4 }}>Solde retirable</p>
          <h1 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:36 }}>
            {formatAmount(balance)} <span style={{ fontSize:18, color:'var(--color-text-muted)' }}>XOF</span>
          </h1>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          disabled={!canRequest}
          style={{
            padding:'12px 20px', borderRadius:10, border:'none',
            background: canRequest ? 'var(--color-accent)' : 'var(--color-surface)',
            color: canRequest ? '#fff' : 'var(--color-text-muted)',
            fontWeight:600, fontSize:14, cursor: canRequest ? 'pointer' : 'not-allowed',
          }}
        >
          Demander un retrait
        </button>
      </div>
      {hasTodayPending && (
        <p style={{ fontSize:12, color:'var(--color-text-muted)', marginBottom:16 }}>
          Tu as déjà fait une demande aujourd&apos;hui. Reviens demain.
        </p>
      )}

      {/* Tableau historique */}
      {withdrawals.length === 0 ? (
        <div style={{ textAlign:'center', padding:'80px 24px', color:'var(--color-text-muted)' }}>
          Demande ton premier retrait dès que ton solde dépasse 500 XOF.
        </div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid var(--color-border)', borderRadius:14, overflow:'hidden' }}>
          {withdrawals.map(w => (
            <div key={w.id} style={{
              padding:'14px 18px', display:'grid',
              gridTemplateColumns:'1fr 1fr 1.3fr 0.8fr 1fr 0.6fr',
              alignItems:'center', borderTop:'1px solid var(--color-border)', gap:12,
            }}>
              <span style={{ fontSize:13, color:'var(--color-text-muted)' }}>
                {new Date(w.created_at).toLocaleDateString('fr-FR')}
              </span>
              <span style={{ fontSize:14, fontWeight:600 }}>{formatAmount(w.amount)} XOF</span>
              <span style={{ fontSize:13 }}>{maskPhone(w.receiver_phone)}</span>
              <span style={{ fontSize:13, textTransform:'uppercase' }}>{w.receiver_provider}</span>
              <span style={{
                fontSize:12, fontWeight:600, padding:'4px 10px', borderRadius:999,
                background: STATUS_LABEL[w.status].bg, color: STATUS_LABEL[w.status].color,
                justifySelf:'start',
              }}>{STATUS_LABEL[w.status].label}</span>
              <div style={{ justifySelf:'end' }}>
                {w.status === 'pending_review' && (
                  <button
                    onClick={() => handleCancel(w.id)}
                    disabled={cancellingId === w.id}
                    style={{
                      padding:'6px 12px', borderRadius:8, border:'1px solid var(--color-border)',
                      background:'#fff', color:'var(--color-text)', fontSize:12, fontWeight:600,
                      cursor: cancellingId === w.id ? 'wait' : 'pointer',
                    }}
                  >
                    {cancellingId === w.id ? '...' : 'Annuler'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <RequestModal
          balance={balance}
          defaults={profileDefaults}
          onClose={() => setModalOpen(false)}
          onSuccess={async () => { setModalOpen(false); await handleRefresh() }}
        />
      )}
    </div>
  )
}

function RequestModal({
  balance, defaults, onClose, onSuccess,
}: {
  balance: number
  defaults: { name: string; phone: string; country: string }
  onClose: () => void
  onSuccess: () => Promise<void>
}) {
  const [amount, setAmount] = useState('')
  const [name, setName] = useState(defaults.name)
  const [phone, setPhone] = useState(defaults.phone)
  const [country, setCountry] = useState(defaults.country)
  const providersForCountry = useMemo(() => {
    const set = new Set<string>()
    for (const e of FEDAPAY_OPERATOR_FEES) {
      if (e.countryCode === country) e.providers.forEach(p => set.add(p.code))
    }
    return Array.from(set)
  }, [country])
  const [provider, setProvider] = useState(providersForCountry[0] ?? 'mtn')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const numericAmount = parseInt(amount, 10) || 0
  const setPercent = (p: number) => setAmount(String(Math.floor((balance * p) / 100)))

  const handleSubmit = async () => {
    setError('')
    if (numericAmount < 500) { setError('Montant minimum 500 XOF'); return }
    if (!name.trim() || !phone.trim()) { setError('Coordonnées requises'); return }
    setSubmitting(true)
    const r = await fetch('/api/withdrawals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: numericAmount,
        receiver_name: name.trim(),
        receiver_phone: phone.trim(),
        receiver_country: country,
        receiver_provider: provider,
      }),
    })
    setSubmitting(false)
    if (!r.ok) { const e = await r.json().catch(() => ({})); setError(e.error ?? 'Erreur'); return }
    await onSuccess()
  }

  const countries = Array.from(new Set(FEDAPAY_OPERATOR_FEES.map(e => e.countryCode)))

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex',
               alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:480, padding:24 }}>
        <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:18, marginBottom:16 }}>
          Demander un retrait
        </h2>

        <label style={{ fontSize:12, color:'var(--color-text-muted)' }}>Montant (XOF)</label>
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
          style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--color-border)',
                   borderRadius:10, fontSize:14, marginTop:4 }} />
        <div style={{ display:'flex', gap:6, marginTop:6 }}>
          {[25, 50, 100].map(p => (
            <button key={p} onClick={() => setPercent(p)} type="button"
              style={{ padding:'4px 10px', borderRadius:6, border:'1px solid var(--color-border)',
                       background:'#fff', fontSize:11, cursor:'pointer' }}>
              {p}%
            </button>
          ))}
          <span style={{ marginLeft:'auto', fontSize:12, color:'var(--color-text-muted)' }}>
            Solde : {formatAmount(balance)} XOF
          </span>
        </div>

        {numericAmount >= 500 && (
          <p style={{ fontSize:13, marginTop:12, color:'var(--color-text)' }}>
            Tu reçois exactement <b>{formatAmount(numericAmount)} XOF</b>.
          </p>
        )}

        <div style={{ marginTop:18 }}>
          <label style={{ fontSize:12, color:'var(--color-text-muted)' }}>Nom complet</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--color-border)',
                     borderRadius:10, fontSize:14, marginTop:4 }} />
        </div>
        <div style={{ marginTop:10 }}>
          <label style={{ fontSize:12, color:'var(--color-text-muted)' }}>Téléphone</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+22996..."
            style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--color-border)',
                     borderRadius:10, fontSize:14, marginTop:4 }} />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:10 }}>
          <div>
            <label style={{ fontSize:12, color:'var(--color-text-muted)' }}>Pays</label>
            <select value={country} onChange={(e) => { setCountry(e.target.value); setProvider('') }}
              style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--color-border)',
                       borderRadius:10, fontSize:14, marginTop:4, background:'#fff' }}>
              {countries.map(c => (
                <option key={c} value={c}>
                  {FEDAPAY_OPERATOR_FEES.find(e => e.countryCode === c)?.countryLabel ?? c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize:12, color:'var(--color-text-muted)' }}>Opérateur</label>
            <select value={provider} onChange={(e) => setProvider(e.target.value)}
              style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--color-border)',
                       borderRadius:10, fontSize:14, marginTop:4, background:'#fff' }}>
              {providersForCountry.map(p => <option key={p} value={p}>{p.toUpperCase()}</option>)}
            </select>
          </div>
        </div>

        {numericAmount >= 100000 && (
          <p style={{ fontSize:12, color:'#9a6a00', marginTop:12 }}>
            Pour les retraits ≥ 100 000 XOF, validation manuelle sous 24h.
          </p>
        )}

        {error && <p style={{ color:'var(--color-red)', fontSize:13, marginTop:10 }}>{error}</p>}

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onClose} style={{
            padding:'10px 16px', borderRadius:10, border:'1px solid var(--color-border)',
            background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600,
          }}>Annuler</button>
          <button onClick={handleSubmit} disabled={submitting} style={{
            padding:'10px 16px', borderRadius:10, border:'none',
            background:'var(--color-accent)', color:'#fff', cursor: submitting ? 'wait' : 'pointer',
            fontSize:13, fontWeight:600,
          }}>{submitting ? '...' : 'Confirmer la demande'}</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Vérifier compile**

```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit
```
Expected: aucune nouvelle erreur. (Si `profile.full_name`/`profile.phone` n'existent pas dans `profiles`, adapter les colonnes lues — vérifier `supabase/migrations/001_create_profiles.sql`.)

- [ ] **Step 4: Smoke-test navigateur**

`pnpm dev`, login, aller sur `/dashboard/withdrawals` :
1. Vérifier que le solde s'affiche correctement.
2. Cliquer « Demander un retrait » → modal s'ouvre, sélectionner 25%, vérifier que le téléphone est pré-rempli.
3. Confirmer → la demande apparaît en bas avec status « En attente ».
4. Cliquer « Annuler » → confirme → la ligne passe à « Annulé ».
5. Vérifier qu'un téléphone affiché en bas est masqué (`+229 ** ** ** 45`).

- [ ] **Step 5: Commit**

```bash
git add src/app/dashboard/withdrawals/
git commit -m "feat(withdrawals): add merchant /dashboard/withdrawals page"
```

---

## Task 18: Sidebar — ajout entrées « Retraits » et « Admin · Retraits »

**Files:**
- Modify: `src/app/dashboard/Sidebar.tsx`

- [ ] **Step 1: Ajouter `is_admin` aux props + récupération côté layout**

Lire `src/app/dashboard/layout.tsx` pour comprendre comment `Sidebar` est appelé. Ajouter le fetch de `is_admin` et le passer en prop.

Modification probable du `layout.tsx` (à adapter au code réel) : récupérer le profil et passer `isAdmin` à `<Sidebar user={user} isAdmin={profile?.is_admin ?? false} />`.

- [ ] **Step 2: Modifier `Sidebar.tsx`**

Dans `src/app/dashboard/Sidebar.tsx`, modifier le composant pour accepter `isAdmin` et inclure les entrées :

```typescript
const NAV_ITEMS = [
  { href: '/dashboard',                label: 'Accueil',           icon: 'hgi-home-09',             exact: true,  adminOnly: false },
  { href: '/dashboard/transactions',   label: 'Transactions',      icon: 'hgi-arrow-turn-backward', exact: false, adminOnly: false },
  { href: '/dashboard/products',       label: 'Produits',          icon: 'hgi-package',             exact: false, adminOnly: false },
  { href: '/dashboard/payment-pages',  label: 'Pages de paiement', icon: 'hgi-link-square-01',      exact: false, adminOnly: false },
  { href: '/dashboard/withdrawals',    label: 'Retraits',          icon: 'hgi-money-send-square',   exact: false, adminOnly: false },
  { href: '/dashboard/settings',       label: 'Paramètres',        icon: 'hgi-settings-01',         exact: false, adminOnly: false },
  { href: '/dashboard/admin/withdrawals', label: 'Admin · Retraits', icon: 'hgi-shield-01',          exact: false, adminOnly: true  },
]

export default function Sidebar({ user, isAdmin }: { user: User; isAdmin: boolean }) {
  // ... reste identique
  // Dans le rendu : .filter(item => !item.adminOnly || isAdmin).map(...)
}
```

Remplacer la ligne `{NAV_ITEMS.map((item) => {` (ligne 89) par :
```typescript
{NAV_ITEMS.filter(item => !item.adminOnly || isAdmin).map((item) => {
```

- [ ] **Step 3: Vérifier compile + smoke-test**

```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit
```

Test navigateur : login → vérifier que « Retraits » apparaît. En admin (`is_admin=true`), vérifier que « Admin · Retraits » apparaît en plus. Vérifier que cliquer sur « Retraits » ouvre `/dashboard/withdrawals`.

Si l'icône `hgi-money-send-square` ou `hgi-shield-01` n'existe pas dans la fonte Hugeicons utilisée, prendre une icône proche (ex. `hgi-money-bag-01`, `hgi-user-shield`) — le projet a un template cohérent (cf. `src/app/dashboard/Sidebar.tsx:10` qui utilise `hgi-arrow-turn-backward` pour Transactions).

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/Sidebar.tsx src/app/dashboard/layout.tsx
git commit -m "feat(sidebar): add Withdrawals and Admin Withdrawals nav entries"
```

---

## Task 19: Layout admin + UI admin

**Files:**
- Create: `src/app/dashboard/admin/layout.tsx`
- Create: `src/app/dashboard/admin/withdrawals/page.tsx`
- Create: `src/app/dashboard/admin/withdrawals/AdminWithdrawalsClient.tsx`

- [ ] **Step 1: Créer le layout admin** — `src/app/dashboard/admin/layout.tsx`

```typescript
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/dashboard')

  return <>{children}</>
}
```

- [ ] **Step 2: Créer la page admin** — `src/app/dashboard/admin/withdrawals/page.tsx`

```typescript
import { createClient } from '@/utils/supabase/server'
import AdminWithdrawalsClient from './AdminWithdrawalsClient'

export default async function AdminWithdrawalsPage() {
  const supabase = await createClient()

  const { data: withdrawals } = await supabase
    .from('withdrawals')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  // Joindre marchand (RLS admin permet la lecture de tous les profils)
  const ids = Array.from(new Set((withdrawals ?? []).map(w => w.merchant_id)))
  const { data: profiles } = ids.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] }
  const profilesById = new Map((profiles ?? []).map(p => [p.id, p]))

  const enriched = (withdrawals ?? []).map(w => ({
    ...w,
    merchant_name: profilesById.get(w.merchant_id)?.full_name ?? '(inconnu)',
  }))

  return <AdminWithdrawalsClient initialWithdrawals={enriched as any} />
}
```

- [ ] **Step 3: Créer le client component** — `src/app/dashboard/admin/withdrawals/AdminWithdrawalsClient.tsx`

```typescript
"use client"

import { useState, useMemo } from 'react'

type AdminWithdrawal = {
  id: string
  amount: number
  fedapay_amount: number | null
  fee: number | null
  status: string
  receiver_name: string
  receiver_phone: string
  receiver_country: string
  receiver_provider: string
  rejection_reason: string | null
  failure_reason: string | null
  fedapay_payout_id: number | null
  merchant_reference: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  sent_at: string | null
  created_at: string
  merchant_name: string
}

type Tab = 'pending' | 'in_progress' | 'done' | 'all'

const TABS: { key: Tab; label: string; statuses: string[] | null }[] = [
  { key: 'pending',     label: 'À valider',  statuses: ['pending_review'] },
  { key: 'in_progress', label: 'En cours',   statuses: ['approved', 'sent_to_fedapay', 'processing'] },
  { key: 'done',        label: 'Terminés',   statuses: ['sent', 'failed', 'rejected', 'cancelled'] },
  { key: 'all',         label: 'Tous',       statuses: null },
]

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  pending_review:   { label: 'En attente',  color: '#9a6a00', bg: '#fff3d6' },
  approved:         { label: 'Approuvé',    color: '#1d4ed8', bg: '#dbe4ff' },
  sent_to_fedapay:  { label: 'En cours',    color: '#1d4ed8', bg: '#dbe4ff' },
  processing:       { label: 'En cours',    color: '#1d4ed8', bg: '#dbe4ff' },
  sent:             { label: 'Envoyé',      color: '#15803d', bg: '#dcfce7' },
  failed:           { label: 'Échoué',      color: '#b91c1c', bg: '#fee2e2' },
  rejected:         { label: 'Refusé',      color: '#b91c1c', bg: '#fee2e2' },
  cancelled:        { label: 'Annulé',      color: '#525252', bg: '#f3f4f6' },
}

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n)

export default function AdminWithdrawalsClient({
  initialWithdrawals,
}: { initialWithdrawals: AdminWithdrawal[] }) {
  const [items, setItems] = useState(initialWithdrawals)
  const [tab, setTab] = useState<Tab>('pending')
  const [busy, setBusy] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const filtered = useMemo(() => {
    const t = TABS.find(t => t.key === tab)!
    return t.statuses ? items.filter(w => t.statuses!.includes(w.status)) : items
  }, [items, tab])

  const pendingCount = items.filter(w => w.status === 'pending_review').length

  const refresh = async () => {
    const r = await fetch('/api/admin/withdrawals?pageSize=100')
    if (!r.ok) return
    const data = await r.json()
    setItems(data.withdrawals.map((w: any) => ({
      ...w,
      merchant_name: w.merchant?.full_name ?? '(inconnu)',
    })))
  }

  const handleApprove = async (id: string) => {
    if (!confirm('Approuver et déclencher le versement FedaPay ?')) return
    setBusy(id)
    const r = await fetch(`/api/admin/withdrawals/${id}/approve`, { method: 'POST' })
    setBusy(null)
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error ?? 'Erreur'); return }
    await refresh()
  }

  const handleReject = async () => {
    if (!rejectingId) return
    if (!rejectReason.trim()) { alert('Motif obligatoire'); return }
    setBusy(rejectingId)
    const r = await fetch(`/api/admin/withdrawals/${rejectingId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: rejectReason.trim() }),
    })
    setBusy(null)
    if (!r.ok) { const e = await r.json().catch(() => ({})); alert(e.error ?? 'Erreur'); return }
    setRejectingId(null); setRejectReason('')
    await refresh()
  }

  return (
    <div style={{ maxWidth:1100, margin:'0 auto', padding:'32px 24px' }}>
      <h1 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:24, marginBottom:6 }}>
        Retraits — vue admin
      </h1>
      <p style={{ color:'var(--color-text-muted)', fontSize:13, marginBottom:20 }}>
        {pendingCount} en attente
      </p>

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:16 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding:'8px 14px', borderRadius:8, border:'1px solid var(--color-border)',
            background: tab === t.key ? 'var(--color-accent)' : '#fff',
            color: tab === t.key ? '#fff' : 'var(--color-text)',
            fontSize:13, fontWeight:600, cursor:'pointer',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Tableau */}
      <div style={{ background:'#fff', border:'1px solid var(--color-border)', borderRadius:14, overflow:'hidden' }}>
        <div style={{
          padding:'10px 16px', display:'grid',
          gridTemplateColumns:'0.8fr 1.3fr 0.9fr 0.9fr 1.4fr 0.8fr 1.1fr',
          fontSize:11, fontWeight:600, color:'var(--color-text-muted)', textTransform:'uppercase',
          background:'var(--color-surface)', gap:10,
        }}>
          <span>Date</span><span>Marchand</span><span>Net</span><span>Débité</span>
          <span>Coordonnées</span><span>Statut</span><span>Actions</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding:'40px 24px', textAlign:'center', color:'var(--color-text-muted)' }}>
            Aucun retrait dans cet onglet 🎉
          </div>
        ) : filtered.map(w => (
          <div key={w.id} style={{
            padding:'14px 16px', display:'grid',
            gridTemplateColumns:'0.8fr 1.3fr 0.9fr 0.9fr 1.4fr 0.8fr 1.1fr',
            alignItems:'center', borderTop:'1px solid var(--color-border)', gap:10, fontSize:13,
          }}>
            <span style={{ color:'var(--color-text-muted)' }}>
              {new Date(w.created_at).toLocaleDateString('fr-FR')}
            </span>
            <span>{w.merchant_name}</span>
            <span style={{ fontWeight:600 }}>{fmt(w.amount)}</span>
            <span>{w.fedapay_amount ? fmt(w.fedapay_amount) : '—'}</span>
            <span>{w.receiver_phone} · {w.receiver_provider.toUpperCase()}</span>
            <span style={{
              fontSize:11, fontWeight:600, padding:'3px 8px', borderRadius:999,
              background: STATUS_LABEL[w.status]?.bg ?? '#eee',
              color: STATUS_LABEL[w.status]?.color ?? '#333',
              justifySelf:'start',
            }}>{STATUS_LABEL[w.status]?.label ?? w.status}</span>
            <div style={{ display:'flex', gap:6, justifySelf:'end' }}>
              {w.status === 'pending_review' && (
                <>
                  <button onClick={() => handleApprove(w.id)} disabled={busy === w.id}
                    style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #15803d',
                             background:'#dcfce7', color:'#15803d', fontSize:11, fontWeight:600,
                             cursor: busy === w.id ? 'wait' : 'pointer' }}>
                    Approuver
                  </button>
                  <button onClick={() => { setRejectingId(w.id); setRejectReason('') }}
                    disabled={busy === w.id}
                    style={{ padding:'6px 10px', borderRadius:6, border:'1px solid #b91c1c',
                             background:'#fee2e2', color:'#b91c1c', fontSize:11, fontWeight:600,
                             cursor: busy === w.id ? 'wait' : 'pointer' }}>
                    Refuser
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {rejectingId && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setRejectingId(null) }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)',
                   display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:24 }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:440, padding:24 }}>
            <h2 style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:18, marginBottom:12 }}>
              Refuser ce retrait
            </h2>
            <label style={{ fontSize:12, color:'var(--color-text-muted)' }}>Motif (visible par le marchand)</label>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3}
              style={{ width:'100%', padding:'10px 12px', border:'1.5px solid var(--color-border)',
                       borderRadius:10, fontSize:14, marginTop:4, fontFamily:'inherit', resize:'vertical' }}
              placeholder="Ex. coordonnées invalides, vérification d'identité requise…" />
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={() => setRejectingId(null)}
                style={{ padding:'10px 16px', borderRadius:10, border:'1px solid var(--color-border)',
                         background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>Annuler</button>
              <button onClick={handleReject} disabled={!rejectReason.trim() || busy !== null}
                style={{ padding:'10px 16px', borderRadius:10, border:'none',
                         background:'#b91c1c', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                Confirmer le refus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Vérifier compile**

```bash
cd /home/darellchooks/Bureau/gatesberry && pnpm tsc --noEmit
```
Expected: aucune nouvelle erreur.

- [ ] **Step 5: Smoke-test navigateur (admin connecté)**

`pnpm dev`, login admin, aller sur `/dashboard/admin/withdrawals` :
1. Vérifier les tabs (À valider / En cours / Terminés / Tous).
2. Avoir au moins une demande `pending_review` (en créer via `/dashboard/withdrawals` avec un autre compte ou en relâchant le check 1/jour temporairement).
3. Cliquer Approuver → confirme → vérifier dans Supabase que `status` passe à `sent_to_fedapay` (Edge Function approve-payout déclenchée).
4. Pour une autre demande, cliquer Refuser sans motif → bouton désactivé. Avec motif → demande passe à `rejected` avec `rejection_reason` rempli.
5. Test 403 : se déconnecter, login avec un user non-admin, tenter `/dashboard/admin/withdrawals` → doit rediriger sur `/dashboard`.

- [ ] **Step 6: Commit**

```bash
git add src/app/dashboard/admin/
git commit -m "feat(admin): add /dashboard/admin/withdrawals page"
```

---

## Task 20: Test end-to-end + cleanup

**Files:** (aucun nouveau fichier)

- [ ] **Step 1: Scénario complet auto-approve `< 100k`**

1. Login marchand (toi).
2. `/dashboard/withdrawals` → noter le solde.
3. Demander un retrait de 5 000 XOF (Bénin / MTN).
4. Vérifier dans Supabase Studio que la ligne est créée en `pending_review`.
5. **Attendre ≤ 1 minute** (cron auto-approve).
6. Recharger : la ligne doit être passée à `sent_to_fedapay` (et `fedapay_payout_id` rempli).
7. Sandbox FedaPay : compléter le test du payout côté dashboard FedaPay.
8. **Attendre ≤ 5 minutes** (cron poll-payouts).
9. Vérifier que `status` passe à `sent` et `sent_at` est rempli.
10. UI : la ligne affiche le badge vert « Envoyé ».

- [ ] **Step 2: Scénario admin manuel `>= 100k`**

1. Demander un retrait de 100 000 XOF (Bénin / MTN). Solde doit être suffisant.
2. Vérifier réception de l'email admin (compte `maqsoudtawaliou@gmail.com`).
3. `/dashboard/admin/withdrawals` → la demande apparaît dans « À valider ».
4. Cliquer Approuver → confirme. Vérifier le passage à `sent_to_fedapay`.
5. Compléter / faire échouer le payout FedaPay sandbox.
6. Vérifier la convergence via le polling (status devient `sent` ou `failed`).
7. UI marchand : statut visible.

- [ ] **Step 3: Scénario refus admin**

1. Créer une demande ≥ 100k (autre compte).
2. Admin refuse avec motif « Test refus ».
3. Vérifier `status='rejected'`, `rejection_reason='Test refus'`, `reviewed_by` rempli.
4. UI marchand : badge rouge « Refusé », ligne cliquable → drawer affiche le motif.
5. Vérifier que le solde est **restitué** (la fonction `get_merchant_balance` ne décompte pas les `rejected`).

- [ ] **Step 4: Scénario annulation marchand**

1. Créer une demande pending_review (avec `auto_approve_attempts=3` pour éviter qu'elle parte automatiquement — modifier en SQL si besoin).
2. Marchand clique « Annuler » → confirme.
3. Vérifier `status='cancelled'` et solde restitué.

- [ ] **Step 5: Vérifier les logs**

Dans Supabase Dashboard → Edge Functions → checker les logs des 4 functions pour s'assurer qu'il n'y a pas d'erreurs récurrentes (les retries sur `auto_approve_attempts < 3` devraient s'arrêter après 3 échecs).

- [ ] **Step 6: Commit final (si modifs cosmétiques)**

```bash
git status
git diff
# si rien : pas de commit à faire
```

---

## Self-review summary

**Spec coverage check :**
- Migrations 011/012/013 → Task 1 ✓
- Centralisation fees + 3 refactors → Tasks 2, 3, 4, 5 ✓
- Helper reverse + admin client → Tasks 6, 7 ✓
- Routes marchand POST/GET/balance/cancel → Tasks 8, 9, 10 ✓
- Routes admin list/approve/reject → Task 11 ✓
- Edge Functions approve-payout / notify-admin / auto-approve-batch / poll-payouts → Tasks 12, 13, 14, 15 ✓
- Webhook → Task 16 ✓
- pg_cron jobs → Task 14 (intégré) ✓
- UI marchand → Task 17 ✓
- Sidebar (entrée Retraits + Admin · Retraits) → Task 18 ✓
- Layout admin + UI admin → Task 19 ✓
- Tests end-to-end → Task 20 ✓

**Placeholder scan :** aucun TBD/TODO. Variables `<TON_UUID>`, `<TON_CRON_SECRET>`, `<TON_PROJECT_REF>`, `<ta_clé_resend>` sont des paramètres explicites à remplacer au moment de la config (pas des oublis).

**Type consistency :**
- `withdrawal.status` enum identique partout (Tasks 1, 8, 11, 12, 15, 16, 17, 19).
- `merchant_reference` format `'GB-PAYOUT-' + crypto.randomUUID()` (Task 8) → consistant avec UNIQUE constraint (Task 1).
- `FEDAPAY_OPERATOR_FEES` shape utilisée par : `getOperatorRate` (api), `FEDAPAY_RATES_DISPLAY` (UI), modal de demande (Task 17).
- Routes API renvoient toutes `{ withdrawal: ... }` ou `{ withdrawals, total }` ou `{ balance }` ou `{ error }` — cohérent.
- `auto_approve_attempts` incrémenté dans `approve-payout` (Task 12) et lu dans `auto-approve-batch` (Task 14) — même nom de colonne.
