import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "./dashboard";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dossiers/")({
  component: DossiersList,
});

function DossiersList() {
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [statut, setStatut] = useState<string>("all");
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin(user?.id);
  const qc = useQueryClient();

  const { data: dossiers } = useQuery({
    queryKey: ["dossiers", q, type, statut],
    queryFn: async () => {
      let req = supabase
        .from("dossiers")
        .select("id, reference, objet, type, statut, updated_at, version, client_id, clients(entreprise)")
        .neq("type", "kits")
        .order("updated_at", { ascending: false });
      if (type !== "all") req = req.eq("type", type as any);
      if (statut !== "all") req = req.eq("statut", statut as any);
      if (q.trim()) req = req.or(`objet.ilike.%${q.trim()}%,reference.ilike.%${q.trim()}%`);
      const { data, error } = await req;
      if (error) throw error;
      return data ?? [];
    },
  });

  async function deleteDossier(id: string) {
    const { error } = await supabase.from("dossiers").delete().eq("id", id);
    if (error) {
      toast.error(`Suppression impossible : ${error.message}`);
      return;
    }
    toast.success("Dossier supprimé");
    qc.invalidateQueries({ queryKey: ["dossiers"] });
  }

  return (
    <div>
      <PageHeader
        title="Dossiers de calcul"
        subtitle="Tous les dossiers, filtrables par client, type et statut."
        actions={
          <Link to="/dossiers/new">
            <Button>
              <Plus className="w-4 h-4 mr-1.5" /> Nouveau dossier
            </Button>
          </Link>
        }
      />

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex gap-3 items-center">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher (référence ou objet)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border-0 focus-visible:ring-0 shadow-none px-0 flex-1"
          />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              <SelectItem value="standard">Standard</SelectItem>
              <SelectItem value="contra">Contra</SelectItem>
              <SelectItem value="stands">Stands</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statut} onValueChange={setStatut}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="brouillon">Brouillon</SelectItem>
              <SelectItem value="valide">Validé</SelectItem>
              <SelectItem value="archive">Archivé</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          {(dossiers ?? []).length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Aucun dossier.
            </div>
          )}
          {(() => {
            const groups = new Map<string, { name: string; items: any[] }>();
            for (const d of (dossiers ?? []) as any[]) {
              const key = d.client_id ?? "none";
              const name = d.clients?.entreprise ?? "— Sans client —";
              if (!groups.has(key)) groups.set(key, { name, items: [] });
              groups.get(key)!.items.push(d);
            }
            const sorted = Array.from(groups.values()).sort((a, b) =>
              a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
            );
            return sorted.map((g) => (
              <div key={g.name} className="border-t first:border-t-0">
                <div className="px-5 py-2 bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.name}
                </div>
                <div className="divide-y">
                  {g.items.map((d: any) => (
                    <div key={d.id} className="flex items-center px-5 py-3 hover:bg-muted/40 group">
                      <Link
                        to="/dossiers/$id"
                        params={{ id: d.id }}
                        className="flex items-center flex-1 min-w-0 gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {d.objet || "(Sans objet)"}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            Indice v{d.version ?? 1}
                          </div>
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
                      {isAdmin && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Supprimer le dossier"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Supprimer définitivement ce dossier ?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                Cette action est irréversible. Le client associé n'est pas
                                supprimé.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteDossier(d.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Supprimer
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ));
          })()}
        </div>

      </Card>
    </div>
  );
}
