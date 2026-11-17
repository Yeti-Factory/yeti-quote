ALTER TABLE clients
ADD COLUMN IF NOT EXISTS sage_data jsonb;

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS sage_synced_at timestamptz;

ALTER TABLE clients
ADD COLUMN IF NOT EXISTS sage_sync_source text;

CREATE INDEX IF NOT EXISTS clients_code_sage_normalized_idx
ON clients (upper(btrim(code_sage)))
WHERE code_sage IS NOT NULL AND btrim(code_sage) <> '';
