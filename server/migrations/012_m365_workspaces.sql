ALTER TABLE dossiers
  ADD COLUMN IF NOT EXISTS workspace_drive_id text,
  ADD COLUMN IF NOT EXISTS workspace_folder_id text,
  ADD COLUMN IF NOT EXISTS workspace_folder_name text,
  ADD COLUMN IF NOT EXISTS workspace_web_url text;

CREATE INDEX IF NOT EXISTS dossiers_workspace_missing_idx
  ON dossiers (updated_at DESC)
  WHERE workspace_folder_id IS NULL;
