import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FolderKanban, Plus, Users, CheckCircle2 } from "lucide-react";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dash-stats"],
    queryFn: async () => {
      const [dossiers, clients, valides] = await Promise.all([
        supabase
          .from("dossiers")
          .select("id", { count: "exact", head: true })
          .neq("type", "kits"),
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase
          .from("dossiers")
          .select("id", { count: "exact", head: true })
          .eq("statut", "valide")
          .neq("type", "kits"),
      ]);
      return {
        dossiers: dossiers.count ?? 0,
        clients: clients.count ?? 0,
        valides: valides.count ?? 0,
      };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["dash-recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("dossiers")
        .select("id, reference, objet, type, statut, updated_at, client_id, clients(entreprise)")
        .neq("type", "kits")
        .order("updated_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        subtitle="Vue d'ensemble de l'activité Yeti Factory."
        actions={
          <Link to="/dossiers/new">
            <Button>
              <Plus className="w-4 h-4 mr-1.5" />
              Nouveau dossier
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard icon={FolderKanban} label="Dossiers" value={stats?.dossiers ?? 0} />
        <StatCard icon={Users} label="Clients" value={stats?.clients ?? 0} />
        <StatCard icon={CheckCircle2} label="Dossiers validés" value={stats?.valides ?? 0} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">Derniers dossiers</h2>
        </div>
        <div className="divide-y">
          {(recent ?? []).length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Aucun dossier pour l'instant. Créez votre premier dossier.
            </div>
          )}
          {(recent ?? []).map((d: any) => (
            <Link
              key={d.id}
              to="/dossiers/$id"
              params={{ id: d.id }}
              className="flex items-center px-5 py-3 hover:bg-muted/40"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{d.objet || "(Sans objet)"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {d.reference} · {d.clients?.entreprise ?? "—"}
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
          ))}
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <Card className="p-5 flex items-center gap-4">
      <div className="w-10 h-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      </div>
    </Card>
  );
}

export function StatusBadge({ statut }: { statut: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    brouillon: { label: "Brouillon", cls: "bg-amber-100 text-amber-900 border-amber-200" },
    valide: { label: "Validé", cls: "bg-green-100 text-green-900 border-green-200" },
    archive: { label: "Archivé", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  };
  const c = map[statut] ?? { label: statut, cls: "" };
  return (
    <Badge variant="outline" className={c.cls}>
      {c.label}
    </Badge>
  );
}
