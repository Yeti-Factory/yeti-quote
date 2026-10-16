type WorkspacePermission = "granted" | "denied" | "prompt";

type WorkspaceDirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission?: (options: { mode: "readwrite" }) => Promise<WorkspacePermission>;
  requestPermission?: (options: { mode: "readwrite" }) => Promise<WorkspacePermission>;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
  }) => Promise<WorkspaceDirectoryHandle>;
};

export type DossierWorkspace = {
  handle: WorkspaceDirectoryHandle;
  name: string;
};

export type WorkspaceWriteResult = "saved" | "cancelled" | "unsupported";

const DB_NAME = "yeti-quote-dossier-workspaces";
const DB_VERSION = 1;
const STORE_NAME = "directories";

function openWorkspaceDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Base locale OneDrive inaccessible"));
  });
}

async function readHandle(dossierId: string) {
  const db = await openWorkspaceDb();
  try {
    return await new Promise<WorkspaceDirectoryHandle | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(dossierId);
      request.onsuccess = () => resolve((request.result as WorkspaceDirectoryHandle | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Dossier de travail inaccessible"));
    });
  } finally {
    db.close();
  }
}

async function writeHandle(dossierId: string, handle: WorkspaceDirectoryHandle) {
  const db = await openWorkspaceDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(handle, dossierId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Dossier de travail non mémorisé"));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Dossier de travail non mémorisé"));
    });
  } finally {
    db.close();
  }
}

async function deleteHandle(dossierId: string) {
  const db = await openWorkspaceDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(dossierId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Dossier local non supprimé"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Dossier local non supprimé"));
    });
  } finally {
    db.close();
  }
}

export function supportsDossierWorkspace() {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof (window as DirectoryPickerWindow).showDirectoryPicker === "function" &&
    typeof indexedDB !== "undefined"
  );
}

export async function chooseDossierWorkspace() {
  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (!supportsDossierWorkspace() || !picker) {
    throw new Error(
      "La sélection automatique du dossier de travail nécessite Microsoft Edge ou Google Chrome.",
    );
  }
  const handle = await picker.call(window, {
    id: "yeti-quote-workspace",
    mode: "readwrite",
    startIn: "documents",
  });
  return { handle, name: handle.name } satisfies DossierWorkspace;
}

export async function setDossierWorkspace(dossierId: string, workspace: DossierWorkspace) {
  await writeHandle(dossierId, workspace.handle);
}

export async function getDossierWorkspace(dossierId: string): Promise<DossierWorkspace | null> {
  if (!supportsDossierWorkspace()) return null;
  const handle = await readHandle(dossierId);
  return handle ? { handle, name: handle.name } : null;
}

export async function copyDossierWorkspace(sourceDossierId: string, targetDossierId: string) {
  const workspace = await getDossierWorkspace(sourceDossierId);
  if (workspace) await setDossierWorkspace(targetDossierId, workspace);
}

export async function removeDossierWorkspace(dossierId: string) {
  if (supportsDossierWorkspace()) await deleteHandle(dossierId);
}

async function ensureWritePermission(handle: WorkspaceDirectoryHandle) {
  const options = { mode: "readwrite" as const };
  if (typeof handle.queryPermission !== "function") return true;
  if ((await handle.queryPermission(options)) === "granted") return true;
  if (typeof handle.requestPermission !== "function") return false;
  return (await handle.requestPermission(options)) === "granted";
}

async function workspaceForWrite(dossierId: string): Promise<DossierWorkspace | "cancelled"> {
  let workspace = await getDossierWorkspace(dossierId);
  if (!workspace) {
    try {
      workspace = await chooseDossierWorkspace();
      await setDossierWorkspace(dossierId, workspace);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      throw error;
    }
  }

  if (await ensureWritePermission(workspace.handle)) return workspace;
  throw new Error("Autorisez l’écriture dans le dossier de travail pour créer l’export.");
}

export async function saveFileToDossierWorkspace(
  dossierId: string,
  filename: string,
  data: Blob,
): Promise<WorkspaceWriteResult> {
  if (!supportsDossierWorkspace()) return "unsupported";
  const workspace = await workspaceForWrite(dossierId);
  if (workspace === "cancelled") return "cancelled";
  const fileHandle = await workspace.handle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(data);
  await writable.close();
  return "saved";
}
