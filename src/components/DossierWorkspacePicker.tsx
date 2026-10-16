import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Folder, FolderPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { DossierWorkspace } from "@/lib/dossier-workspace";

type FolderItem = { id: string; name: string; webUrl: string | null };
type FolderResponse = {
  configured: boolean;
  driveId: string;
  rootFolderId: string;
  rootFolderName: string;
  current: FolderItem;
  folders: FolderItem[];
  error?: string;
};

type TrailItem = FolderItem;

export function DossierWorkspacePicker({
  open,
  onOpenChange,
  onSelect,
  suggestedName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (workspace: DossierWorkspace) => void | Promise<void>;
  suggestedName?: string;
}) {
  const [data, setData] = useState<FolderResponse | null>(null);
  const [trail, setTrail] = useState<TrailItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [newFolderName, setNewFolderName] = useState("");

  async function loadFolder(parentId: string | null, nextTrail?: TrailItem[]) {
    setLoading(true);
    setError("");
    try {
      const query = parentId ? `?parentId=${encodeURIComponent(parentId)}` : "";
      const response = await fetch(`/api/m365/folders${query}`, { credentials: "include" });
      const json = (await response.json().catch(() => ({}))) as FolderResponse;
      if (!response.ok || !json.configured) {
        throw new Error(
          json.error || "La bibliothèque Microsoft 365 de YetiQuote n’est pas encore configurée.",
        );
      }
      setData(json);
      setTrail(nextTrail ?? [{ ...json.current, name: json.rootFolderName || json.current.name }]);
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : "Dossiers Microsoft 365 inaccessibles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    setData(null);
    setTrail([]);
    setError("");
    setNewFolderName(suggestedName?.trim() ?? "");
    void loadFolder(null);
  }, [open, suggestedName]);

  async function enterFolder(folder: FolderItem) {
    await loadFolder(folder.id, [...trail, folder]);
  }

  async function goBack() {
    if (trail.length <= 1) return;
    const nextTrail = trail.slice(0, -1);
    await loadFolder(nextTrail.at(-1)!.id, nextTrail);
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name || !data) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/m365/folders", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: data.current.id, name }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        driveId?: string;
        folder?: FolderItem;
        error?: string;
      };
      if (!response.ok || !json.folder) throw new Error(json.error || "Création impossible");
      setNewFolderName("");
      await enterFolder(json.folder);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Création impossible");
    } finally {
      setSaving(false);
    }
  }

  async function selectCurrent() {
    if (!data) return;
    setSaving(true);
    try {
      await onSelect({
        driveId: data.driveId,
        folderId: data.current.id,
        name: data.current.name,
        webUrl: data.current.webUrl,
      });
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Association impossible");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choisir le dossier de travail partagé</DialogTitle>
          <DialogDescription>
            Cet emplacement Microsoft 365 sera commun à tous les utilisateurs de YetiQuote.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-sm">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              disabled={trail.length <= 1 || loading}
              onClick={goBack}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {trail.map((item, index) => (
              <span key={item.id} className="flex items-center gap-1 font-medium">
                {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                {item.name}
              </span>
            ))}
          </div>

          <div className="min-h-52 rounded-md border">
            {loading && (
              <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Chargement…
              </div>
            )}
            {!loading && error && (
              <div className="p-4 text-sm text-destructive">{error}</div>
            )}
            {!loading && !error && data?.folders.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Aucun sous-dossier.
              </div>
            )}
            {!loading && !error && data?.folders.map((folder) => (
              <button
                type="button"
                key={folder.id}
                className="flex w-full items-center gap-3 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/50"
                onClick={() => enterFolder(folder)}
              >
                <Folder className="h-5 w-5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>

          {data && !error && (
            <div className="flex gap-2">
              <Input
                value={newFolderName}
                onChange={(event) => setNewFolderName(event.target.value)}
                placeholder="Nom du nouveau sous-dossier"
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void createFolder();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={!newFolderName.trim() || saving}
                onClick={createFolder}
              >
                <FolderPlus className="mr-1.5 h-4 w-4" /> Créer
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" disabled={!data || Boolean(error) || saving} onClick={selectCurrent}>
            Utiliser ce dossier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
