import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { z } from "zod";
import { backend } from "@/integrations/native/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { DossierWorkspacePicker } from "@/components/DossierWorkspacePicker";
import { workspaceFields, type DossierWorkspace } from "@/lib/dossier-workspace";

const searchSchema = z.object({ client: z.string().optional() });

export const Route = createFileRoute("/_authenticated/dossiers/new")({
  validateSearch: searchSchema,
  component: NewDossier,
});

function NewDossier() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { user } = useAuth();

  const { data: clients } = useQuery({
    queryKey: ["clients-select"],
    queryFn: async () => {
      const { data } = await backend
        .from("clients")
        .select("id, entreprise, contact, email")
        .order("entreprise");
      return data ?? [];
    },
  });

  const [clientId, setClientId] = useState<string>(search.client ?? "");
  const [objet, setObjet] = useState("");
  const [type, setType] = useState<"standard" | "contra" | "stands">("standard");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [workspace, setWorkspace] = useState<DossierWorkspace | null>(null);
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);

  // The dossier number is generated automatically server-side when left empty.

  async function create() {
    if (!clientId) return toast.error("Sélectionnez un client.");
    if (!objet.trim()) return toast.error("La référence est requise.");
    if (!workspace) {
      setWorkspacePickerOpen(true);
      return;
    }
    setBusy(true);
    try {
      const client = clients?.find((c: any) => c.id === clientId);
      const { data, error } = await backend
        .from("dossiers")
        .insert({
          reference: reference.trim(),
          objet: objet.trim(),
          client_id: clientId,
          contact: client?.contact ?? null,
          email: client?.email ?? null,
          type,
          statut: "brouillon",
          created_by: user!.id,
          ...workspaceFields(workspace),
        })
        .select("id")
        .single();
      if (error) throw error;
      toast.success("Dossier créé");
      navigate({ to: "/dossiers/$id", params: { id: data.id } });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Nouveau dossier"
        subtitle="Renseignez les informations de base, puis lancez le calcul."
      />
      <Card className="p-6 space-y-4">
        <div>
          <Label>Dossier</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">Généré automatiquement, modifiable.</p>
        </div>
        <div>
          <Label>Client *</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionner un client…" />
            </SelectTrigger>
            <SelectContent>
              {(clients ?? []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.entreprise}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Référence *</Label>
          <Input
            value={objet}
            onChange={(e) => setObjet(e.target.value)}
            placeholder="Ex : PLV pour campagne X"
          />
        </div>
        <div>
          <Label>Type de calcul *</Label>
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard (TdP)</SelectItem>
              <SelectItem value="contra">Contra</SelectItem>
              <SelectItem value="stands">Stands</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-md border p-4 space-y-2">
          <Label>Dossier de travail partagé *</Label>
          <p className="text-sm text-muted-foreground">
            Choisissez ou créez le dossier client/projet dans l’espace Microsoft 365 commun. Tous les
            utilisateurs de YetiQuote retrouveront le même emplacement.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setWorkspacePickerOpen(true)}
            >
              <FolderOpen className="w-4 h-4 mr-1.5" />
              {workspace ? "Changer de dossier" : "Choisir ou créer le dossier"}
            </Button>
            <span className={workspace ? "text-sm font-medium" : "text-sm text-destructive"}>
              {workspace ? workspace.name : "Aucun dossier sélectionné"}
            </span>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => navigate({ to: "/dossiers" })}>
            Annuler
          </Button>
          <Button onClick={create} disabled={busy}>
            {busy ? "…" : workspace ? "Créer le dossier" : "Choisir le dossier et créer"}
          </Button>
        </div>
      </Card>
      <DossierWorkspacePicker
        open={workspacePickerOpen}
        onOpenChange={setWorkspacePickerOpen}
        suggestedName={objet.trim()}
        onSelect={(selected) => setWorkspace(selected)}
      />
    </div>
  );
}
