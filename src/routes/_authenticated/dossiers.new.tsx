import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

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
      const { data } = await supabase
        .from("clients")
        .select("id, entreprise, contact, email")
        .order("entreprise");
      return data ?? [];
    },
  });

  const [clientId, setClientId] = useState<string>(search.client ?? "");
  const [objet, setObjet] = useState("");
  const [type, setType] = useState<"standard" | "contra" | "kits" | "stands">("standard");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc("next_dossier_reference").then(({ data }) => {
      if (data && !reference) setReference(data as unknown as string);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    if (!clientId) return toast.error("Sélectionnez un client.");
    if (!objet.trim()) return toast.error("L'objet est requis.");
    setBusy(true);
    try {
      const client = clients?.find((c) => c.id === clientId);
      const { data, error } = await supabase
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
      <PageHeader title="Nouveau dossier" subtitle="Renseignez les informations de base, puis lancez le calcul." />
      <Card className="p-6 space-y-4">
        <div>
          <Label>Référence</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">Générée automatiquement, modifiable.</p>
        </div>
        <div>
          <Label>Client *</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger><SelectValue placeholder="Sélectionner un client…" /></SelectTrigger>
            <SelectContent>
              {(clients ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.entreprise}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Objet *</Label>
          <Input value={objet} onChange={(e) => setObjet(e.target.value)} placeholder="Ex : PLV pour campagne X" />
        </div>
        <div>
          <Label>Type de calcul *</Label>
          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard (TdP)</SelectItem>
              <SelectItem value="contra">Contra</SelectItem>
              <SelectItem value="kits">Kits</SelectItem>
              <SelectItem value="stands">Stands</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => navigate({ to: "/dossiers" })}>Annuler</Button>
          <Button onClick={create} disabled={busy}>{busy ? "…" : "Créer le dossier"}</Button>
        </div>
      </Card>
    </div>
  );
}
