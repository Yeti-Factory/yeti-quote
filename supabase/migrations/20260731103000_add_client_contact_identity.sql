ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS civilite TEXT,
  ADD COLUMN IF NOT EXISTS prenom TEXT,
  ADD COLUMN IF NOT EXISTS nom TEXT;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_civilite_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_civilite_check
  CHECK (civilite IS NULL OR civilite IN ('monsieur', 'madame'));
