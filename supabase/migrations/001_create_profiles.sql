-- ============================================================
-- Table: profiles
-- Créée automatiquement lors du premier login d'un utilisateur.
-- Stocke les informations du marchand (numéro mobile money, etc.)
-- ============================================================

CREATE TABLE public.profiles (
  id                    UUID          REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name             TEXT,
  mobile_money_number   TEXT,
  mobile_money_operator TEXT,
  is_onboarded          BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Row Level Security ──────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture profil personnel"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Insertion profil personnel"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Modification profil personnel"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ── Trigger updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
