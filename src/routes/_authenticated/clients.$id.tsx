import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { backend } from "@/integrations/native/client";
import { useAuth, useIsAdmin } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClientDialog } from "./clients.index";
import { formatClientContact } from "@/lib/client-contact";
import { StatusBadge } from "./dashboard";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { ArrowLeft, Database, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/clients/$id")({
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);
  const [edit, setEdit] = useState(false);
  const [sageSyncing, setSageSyncing] = useState(false);

  const { data: client } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await backend.from("clients").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: dossiers } = useQuery({
    queryKey: ["client-dossiers", id],
    queryFn: async () => {
      const { data } = await backend
        .from("dossiers")
        .select("id, reference, objet, type, statut, updated_at, version")
        .eq("client_id", id)
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  async function del() {
    const { error } = await backend.from("clients").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Client supprimé");
    navigate({ to: "/clients" });
  }

  async function syncSage() {
    setSageSyncing(true);
    try {
      const created = await fetch("/api/sage-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: id }),
      });
      const request = await created.json();
      if (!created.ok) throw new Error(request.error || "Demande Sage impossible");

      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const checked = await fetch(`/api/sage-sync?id=${encodeURIComponent(request.id)}`);
        const status = await checked.json();
        if (!checked.ok) throw new Error(status.error || "Suivi Sage impossible");
        if (status.status === "completed") {
          await qc.invalidateQueries({ queryKey: ["client", id] });
          toast.success(`Fiche Sage récupérée depuis ${status.source || "le poste disponible"}`);
          return;
        }
        if (status.status === "failed") throw new Error(status.error || "Lecture Sage impossible");
      }
      toast.info("Demande enregistrée. Aucun connecteur Sage n’a répondu pour le moment.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Lecture Sage impossible");
    } finally {
      setSageSyncing(false);
    }
  }

  if (!client) return <div className="text-sm text-muted-foreground">Chargement…</div>;

  const sage =
    client.sage_data && typeof client.sage_data === "object" && !Array.isArray(client.sage_data)
      ? (client.sage_data as Record<string, any>)
      : null;
  const billing = sage?.billingAddress ?? {};
  const sageAddress = [
    billing.line1,
    billing.line2,
    billing.line3,
    [billing.postalCode, billing.city].filter(Boolean).join(" "),
    billing.countryName,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div>
      <Link
        to="/clients"
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Retour aux clients
      </Link>
      <PageHeader
        title={client.entreprise}
        subtitle={formatClientContact(client) || undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => setEdit(true)}>
              <Pencil className="w-4 h-4 mr-1.5" /> Modifier
            </Button>
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-destructive">
                    <Trash2 className="w-4 h-4 mr-1.5" /> Supprimer
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer ce client ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action est définitive. Les dossiers liés empêcheront la suppression.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={del}>Supprimer</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Link to="/dossiers/new" search={{ client: id }}>
              <Button>
                <Plus className="w-4 h-4 mr-1.5" /> Nouveau dossier
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase mb-1">Email</div>
          <div className="text-sm">{client.email || "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase mb-1">Téléphone</div>
          <div className="text-sm">{client.telephone || "—"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground uppercase mb-1">Adresse</div>
          <div className="text-sm whitespace-pre-line">{client.adresse || "—"}</div>
        </Card>
      </div>

      {client.code_sage && (
        <Card className="p-5 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <div className="flex items-center gap-2 font-semibold">
                <Database className="w-4 h-4 text-primary" /> Fiche Sage {client.code_sage}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {client.sage_synced_at
                  ? `Lue dans Sage le ${fmtDate(client.sage_synced_at)} depuis ${client.sage_sync_source || "un poste Yeti"}.`
                  : "En attente de la première synchronisation depuis un poste équipé de Sage."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={sage ? "default" : "outline"}>
                {sage ? "Synchronisée" : "En attente"}
              </Badge>
              <Button size="sm" variant="outline" onClick={syncSage} disabled={sageSyncing}>
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${sageSyncing ? "animate-spin" : ""}`} />
                {sageSyncing ? "Lecture de Sage…" : "Récupérer la fiche Sage"}
              </Button>
            </div>
          </div>
          {sage && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground uppercase mb-1">Identité Sage</div>
                <div className="font-medium">{sage.name || billing.company || "—"}</div>
                <div className="whitespace-pre-line text-muted-foreground">
                  {sageAddress || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase mb-1">Fiscalité</div>
                <div>TVA : {sage.vatNumber || "—"}</div>
                <div>SIRET : {sage.siret || "—"}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase mb-1">Règlement</div>
                <div>{sage.paymentMethodLabel || sage.paymentMethodCode || "—"}</div>
                <div className="text-muted-foreground">
                  {sage.paymentTermLabel || sage.paymentTermCode || "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase mb-1">Commercial</div>
                <div>{sage.representativeName || sage.representativeCode || "—"}</div>
                <div className="text-muted-foreground">
                  {sage.contact?.name || sage.email || "—"}
                </div>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Historique des dossiers ({dossiers?.length ?? 0})</h2>
        </div>
        <div className="divide-y">
          {(dossiers ?? []).length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Aucun dossier pour ce client.
            </div>
          )}
          {(dossiers ?? []).map((d: any) => (
            <Link
              key={d.id}
              to="/dossiers/$id"
              params={{ id: d.id }}
              className="flex items-center px-5 py-3 hover:bg-muted/40"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{d.objet || "(Sans référence)"}</div>
                <div className="text-xs text-muted-foreground">Indice v{d.version ?? 1}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="outline" className="capitalize">
                  {d.type}
                </Badge>
                <StatusBadge statut={d.statut} />
                <span className="text-xs text-muted-foreground w-24 text-right">
                  {fmtDate(d.updated_at)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <ClientDialog
        open={edit}
        onOpenChange={setEdit}
        initial={client}
        onSaved={() => qc.invalidateQueries({ queryKey: ["client", id] })}
      />
    </div>
  );
}
