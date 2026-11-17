CREATE TABLE IF NOT EXISTS sage_sync_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  code_sage text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  requested_by text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  source text,
  error text
);

CREATE INDEX IF NOT EXISTS sage_sync_requests_pending_idx
ON sage_sync_requests (requested_at)
WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS sage_sync_requests_one_active_per_client_idx
ON sage_sync_requests (client_id)
WHERE status IN ('pending', 'processing');
