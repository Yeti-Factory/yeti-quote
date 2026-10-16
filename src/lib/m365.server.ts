import "@tanstack/react-start/server-only";

type GraphToken = { accessToken: string; expiresAt: number };

export type M365Folder = {
  id: string;
  name: string;
  webUrl: string | null;
};

let cachedToken: GraphToken | null = null;

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

export function getM365Config() {
  const config = {
    tenantId: env("M365_TENANT_ID"),
    clientId: env("M365_CLIENT_ID"),
    clientSecret: env("M365_CLIENT_SECRET"),
    siteId: env("M365_SITE_ID"),
    driveId: env("M365_DRIVE_ID"),
    rootFolderId: env("M365_ROOT_FOLDER_ID"),
    rootFolderName: env("M365_ROOT_FOLDER_NAME") || "Partage",
  };
  return {
    ...config,
    configured: Boolean(
      config.tenantId && config.clientId && config.clientSecret && config.driveId,
    ),
  };
}

async function accessToken() {
  const config = getM365Config();
  if (!config.configured) {
    throw new Error("La connexion Microsoft 365 de YetiQuote n’est pas encore configurée.");
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.accessToken;

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description || "Connexion Microsoft 365 impossible.");
  }
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + Math.max(300, Number(json.expires_in ?? 3600)) * 1000,
  };
  return cachedToken.accessToken;
}

async function graph<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body && !(init.body instanceof ArrayBuffer)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const json = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(json.error?.message || `Microsoft 365 a répondu ${response.status}.`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function itemPath(itemId: string | null) {
  return itemId ? `/items/${encodeURIComponent(itemId)}` : "/root";
}

export async function listM365Folders(parentId?: string | null) {
  const config = getM365Config();
  const itemId = parentId || config.rootFolderId || null;
  const base = `/drives/${encodeURIComponent(config.driveId)}${itemPath(itemId)}`;
  const [current, children] = await Promise.all([
    graph<{ id: string; name: string; webUrl?: string }>(`${base}?$select=id,name,webUrl`),
    graph<{
      value: Array<{ id: string; name: string; webUrl?: string; folder?: object }>;
    }>(`${base}/children?$select=id,name,webUrl,folder&$orderby=name`),
  ]);
  return {
    driveId: config.driveId,
    rootFolderId: config.rootFolderId || current.id,
    rootFolderName: config.rootFolderName,
    current: {
      id: current.id,
      name: current.name,
      webUrl: current.webUrl ?? null,
    } satisfies M365Folder,
    folders: children.value
      .filter((item) => Boolean(item.folder))
      .map(
        (item) =>
          ({ id: item.id, name: item.name, webUrl: item.webUrl ?? null }) satisfies M365Folder,
      ),
  };
}

export async function createM365Folder(parentId: string | null, name: string) {
  const config = getM365Config();
  const itemId = parentId || config.rootFolderId || null;
  const base = `/drives/${encodeURIComponent(config.driveId)}${itemPath(itemId)}`;
  const item = await graph<{ id: string; name: string; webUrl?: string }>(`${base}/children`, {
    method: "POST",
    body: JSON.stringify({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    }),
  });
  return {
    driveId: config.driveId,
    folder: { id: item.id, name: item.name, webUrl: item.webUrl ?? null } satisfies M365Folder,
  };
}

export async function uploadM365File({
  driveId,
  folderId,
  filename,
  contentType,
  data,
}: {
  driveId: string;
  folderId: string;
  filename: string;
  contentType: string;
  data: ArrayBuffer;
}) {
  const config = getM365Config();
  if (driveId !== config.driveId) throw new Error("Bibliothèque Microsoft 365 inconnue.");
  const safeFilename = filename.replace(/[\\/:*?"<>|#%]/g, "-").replace(/[. ]+$/g, "").trim();
  if (!safeFilename) throw new Error("Nom de fichier invalide.");
  return graph<{ id: string; name: string; webUrl?: string }>(
    `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}:/${encodeURIComponent(safeFilename)}:/content`,
    {
      method: "PUT",
      headers: { "Content-Type": contentType || "application/octet-stream" },
      body: data,
    },
  );
}
