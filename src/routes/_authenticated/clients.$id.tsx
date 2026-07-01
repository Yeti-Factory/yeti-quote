import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClientDialog } from "./clients.index";
import { StatusBadge } from "./dashboard";
import { Badge } from "@/components/ui/badge";
import { fmtDate } from "@/lib/format";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
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

  const { data: client } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: dossiers } = useQuery({
    queryKey: ["client-dossiers", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("dossiers")
        .select("id, reference, objet, type, statut, updated_at")
        .eq("client_id", id)
        .order("updated_at", { ascending: false });
      return data ?? [];
    },
  });

  async function del() {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Client supprimé");
    navigate({ to: "/clients" });
  }

  if (!client) return <div className="text-sm text-muted-foreground">Chargement…</div>;

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
        subtitle={client.contact || undefined}
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
                <div className="font-medium text-sm">{d.objet || "(Sans objet)"}</div>
                <div className="text-xs text-muted-foreground">{d.reference}</div>
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
