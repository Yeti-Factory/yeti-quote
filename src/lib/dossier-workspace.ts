export type DossierWorkspace = {
  driveId: string;
  folderId: string;
  name: string;
  webUrl: string | null;
};

export type WorkspaceFields = {
  workspace_drive_id?: string | null;
  workspace_folder_id?: string | null;
  workspace_folder_name?: string | null;
  workspace_web_url?: string | null;
};

export function workspaceFields(workspace: DossierWorkspace): Required<WorkspaceFields> {
  return {
    workspace_drive_id: workspace.driveId,
    workspace_folder_id: workspace.folderId,
    workspace_folder_name: workspace.name,
    workspace_web_url: workspace.webUrl,
  };
}

export function workspaceFromFields(value: WorkspaceFields): DossierWorkspace | null {
  if (!value.workspace_drive_id || !value.workspace_folder_id) return null;
  return {
    driveId: value.workspace_drive_id,
    folderId: value.workspace_folder_id,
    name: value.workspace_folder_name || "Dossier Microsoft 365",
    webUrl: value.workspace_web_url || null,
  };
}

export async function saveFileToDossierWorkspace(dossierId: string, filename: string, data: Blob) {
  const response = await fetch(
    `/api/dossiers/${encodeURIComponent(dossierId)}/files?filename=${encodeURIComponent(filename)}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": data.type || "application/octet-stream" },
      body: data,
    },
  );
  const json = (await response.json().catch(() => ({}))) as { error?: string; webUrl?: string };
  if (!response.ok) throw new Error(json.error || "Enregistrement Microsoft 365 impossible");
  return { status: "saved" as const, webUrl: json.webUrl ?? null };
}
