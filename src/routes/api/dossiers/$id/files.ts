import { createFileRoute } from "@tanstack/react-router";
import { pool } from "@/lib/db.server";
import { uploadM365File } from "@/lib/m365.server";
import { getIdentity } from "@/lib/session.server";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function upload(request: Request, id: string) {
  const identity = await getIdentity(request);
  if (!identity) return Response.json({ error: "Session expirée" }, { status: 401 });

  const filename = new URL(request.url).searchParams.get("filename")?.trim() ?? "";
  if (!filename) return Response.json({ error: "Nom de fichier manquant" }, { status: 400 });
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_FILE_SIZE) {
    return Response.json({ error: "Le fichier dépasse 10 Mo" }, { status: 413 });
  }

  const dossier = await pool.query<{
    workspace_drive_id: string | null;
    workspace_folder_id: string | null;
  }>(
    "SELECT workspace_drive_id, workspace_folder_id FROM dossiers WHERE id = $1",
    [id],
  );
  if (!dossier.rowCount) return Response.json({ error: "Dossier inconnu" }, { status: 404 });
  const workspace = dossier.rows[0];
  if (!workspace.workspace_drive_id || !workspace.workspace_folder_id) {
    return Response.json(
      { error: "Associez d’abord ce dossier à son emplacement Microsoft 365." },
      { status: 409 },
    );
  }

  try {
    const data = await request.arrayBuffer();
    if (data.byteLength > MAX_FILE_SIZE) {
      return Response.json({ error: "Le fichier dépasse 10 Mo" }, { status: 413 });
    }
    const item = await uploadM365File({
      driveId: workspace.workspace_drive_id,
      folderId: workspace.workspace_folder_id,
      filename,
      contentType: request.headers.get("content-type") ?? "application/octet-stream",
      data,
    });
    return Response.json({ id: item.id, name: item.name, webUrl: item.webUrl ?? null });
  } catch (error) {
    console.error("Export Microsoft 365 impossible", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Export Microsoft 365 impossible" },
      { status: 502 },
    );
  }
}

export const Route = createFileRoute("/api/dossiers/$id/files")({
  server: { handlers: { POST: ({ request, params }) => upload(request, params.id) } },
});
