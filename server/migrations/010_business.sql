DO $$ BEGIN
  CREATE TYPE app_role AS ENUM ('admin', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE dossier_type AS ENUM ('standard', 'contra', 'kits', 'stands');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE dossier_statut AS ENUM ('brouillon', 'valide', 'archive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS profiles (
  id text PRIMARY KEY,
  full_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS profiles_updated ON profiles;
CREATE TRIGGER profiles_updated BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entreprise text NOT NULL,
  contact text,
  email text,
  telephone text,
  adresse text,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS clients_entreprise_idx ON clients(lower(entreprise));
DROP TRIGGER IF EXISTS clients_updated ON clients;
CREATE TRIGGER clients_updated BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE SEQUENCE IF NOT EXISTS dossier_ref_seq START 1;
CREATE OR REPLACE FUNCTION next_dossier_reference()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE n bigint; BEGIN
  n := nextval('dossier_ref_seq');
  RETURN 'YETI-' || to_char(now(), 'YYYY') || '-' || lpad(n::text, 4, '0');
END; $$;

CREATE TABLE IF NOT EXISTS dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT next_dossier_reference(),
  objet text NOT NULL,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  contact text,
  email text,
  type dossier_type NOT NULL,
  statut dossier_statut NOT NULL DEFAULT 'brouillon',
  onedrive_note text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS dossiers_client_idx ON dossiers(client_id);
CREATE INDEX IF NOT EXISTS dossiers_type_idx ON dossiers(type);
CREATE INDEX IF NOT EXISTS dossiers_statut_idx ON dossiers(statut);
DROP TRIGGER IF EXISTS dossiers_updated ON dossiers;
CREATE TRIGGER dossiers_updated BEFORE UPDATE ON dossiers
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS app_defaults (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS migration_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  manifest_sha256 text NOT NULL,
  counts jsonb NOT NULL
);
