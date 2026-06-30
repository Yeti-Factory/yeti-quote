import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/clients/")({
  component: ClientsPage,
});

function ClientsPage() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data: clients } = useQuery({
    queryKey: ["clients", q],
    queryFn: async () => {
      let req = supabase
        .from("clients")
        .select("id, entreprise, contact, email, telephone, updated_at, dossiers(count)")
        .order("updated_at", { ascending: false });
      if (q.trim()) req = req.ilike("entreprise", `%${q.trim()}%`);
      const { data, error } = await req;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Liste des clients et leurs dossiers."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" /> Nouveau client
          </Button>
        }
      />

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex gap-2 items-center">
          <Search className="w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher par entreprise…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="border-0 focus-visible:ring-0 shadow-none px-0"
          />
        </div>
        <div className="divide-y">
          {(clients ?? []).length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              Aucun client.
            </div>
          )}
          {(clients ?? []).map((c: any) => (
            <Link
              key={c.id}
              to="/clients/$id"
              params={{ id: c.id }}
              className="flex items-center px-5 py-3 hover:bg-muted/40"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{c.entreprise}</div>
                <div className="text-xs text-muted-foreground">
                  {c.contact || "—"} · {c.email || "—"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground w-24 text-right shrink-0">
                {c.dossiers?.[0]?.count ?? 0} dossier{(c.dossiers?.[0]?.count ?? 0) > 1 ? "s" : ""}
              </div>
              <div className="text-xs text-muted-foreground w-28 text-right shrink-0">
                {fmtDate(c.updated_at)}
              </div>
            </Link>
          ))}
        </div>
      </Card>

      <ClientDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

export function ClientDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  initial?: any;
  onSaved?: (id: string) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    entreprise: initial?.entreprise ?? "",
    contact: initial?.contact ?? "",
    email: initial?.email ?? "",
    telephone: initial?.telephone ?? "",
    adresse: initial?.adresse ?? "",
    notes: initial?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!form.entreprise.trim()) {
      toast.error("L'entreprise est requise.");
      return;
    }
    setBusy(true);
    try {
      if (initial?.id) {
        const { error } = await supabase.from("clients").update(form).eq("id", initial.id);
        if (error) throw error;
        toast.success("Client mis à jour");
        onSaved?.(initial.id);
      } else {
        const { data, error } = await supabase
          .from("clients")
          .insert({ ...form, created_by: user!.id })
          .select("id")
          .single();
        if (error) throw error;
        toast.success("Client créé");
        onOpenChange(false);
        onSaved?.(data.id);
        if (!onSaved) navigate({ to: "/clients/$id", params: { id: data.id } });
      }
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Modifier le client" : "Nouveau client"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Entreprise *</Label>
            <Input
              value={form.entreprise}
              onChange={(e) => setForm({ ...form, entreprise: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Contact</Label>
              <Input
                value={form.contact}
                onChange={(e) => setForm({ ...form, contact: e.target.value })}
              />
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <Label>Adresse</Label>
            <Textarea
              rows={2}
              value={form.adresse}
              onChange={(e) => setForm({ ...form, adresse: e.target.value })}
            />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
