import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { Plus, Search } from "lucide-react";
import { StatusBadge } from "./dashboard";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dossiers/")({
  component: DossiersList,
});

function DossiersList() {
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [statut, setStatut] = useState<string>("all");

  const { data: dossiers } = useQuery({
    queryKey: ["dossiers", q, type, statut],
    queryFn: async () => {
      let req = supabase
        .from("dossiers")
        .select("id, reference, objet, type, statut, updated_at, clients(entreprise)")
        .order("updated_at", { ascending: false });
      if (type !== "all") req = req.eq("type", type as any);
      if (statut !== "all") req = req.eq("statut", statut as any);
      if (q.trim()) req = req.or(`objet.ilike.%${q.trim()}%,reference.ilike.%${q.trim()}%`);
      const { data, error } = await req;
      if (error) throw error;
      return data ?? [];
    },
  });

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
        <div className="divide-y">
          {(dossiers ?? []).length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Aucun dossier.
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
