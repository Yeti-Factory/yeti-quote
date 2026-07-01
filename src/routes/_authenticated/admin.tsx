import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin(user?.id);
  const navigate = useNavigate();

  useEffect(() => {
    if (user && !isAdmin) navigate({ to: "/dashboard", replace: true });
  }, [user, isAdmin, navigate]);

  if (!isAdmin) return null;

  return (
    <div>
      <PageHeader title="Administration" subtitle="Coefficients par défaut et utilisateurs." />
      <Tabs defaultValue="coefs">
        <TabsList>
          <TabsTrigger value="coefs">Coefficients par défaut</TabsTrigger>
          <TabsTrigger value="users">Utilisateurs</TabsTrigger>
        </TabsList>
        <TabsContent value="coefs"><CoefsPanel /></TabsContent>
        <TabsContent value="users"><UsersPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function CoefsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin_defaults"],
    queryFn: async () => {
      const { data } = await supabase.from("app_defaults").select("*").order("key");
      // Kits est masqué de l'UI (conservé en base pour compat legacy).
      return (data ?? []).filter((d: any) => d.key !== "kits");
    },
  });
  const [edits, setEdits] = useState<Record<string, string>>({});
  useEffect(() => {
    if (data) {
      const next: Record<string, string> = {};
      data.forEach((d: any) => (next[d.key] = JSON.stringify(d.value, null, 2)));
      setEdits(next);
    }
  }, [data]);

  async function save(key: string) {
    let value: any;
    try {
      value = JSON.parse(edits[key]);
    } catch {
      return toast.error("JSON invalide");
    }
    const { error } = await supabase.from("app_defaults").update({ value }).eq("key", key);
    if (error) return toast.error(error.message);
    toast.success(`Coefficients ${key} mis à jour`);
    qc.invalidateQueries({ queryKey: ["app_defaults"] });
    qc.invalidateQueries({ queryKey: ["admin_defaults"] });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      {(data ?? []).map((d: any) => (
        <Card key={d.key} className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold capitalize">{d.key}</h3>
            <Button size="sm" onClick={() => save(d.key)}>Enregistrer</Button>
          </div>
          <Textarea
            value={edits[d.key] ?? ""}
            onChange={(e) => setEdits({ ...edits, [d.key]: e.target.value })}
            rows={10}
            className="font-mono text-xs"
          />
        </Card>
      ))}
    </div>
  );
}

function UsersPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["admin_users"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const roleMap = new Map<string, string[]>();
      (roles ?? []).forEach((r: any) => {
        const arr = roleMap.get(r.user_id) ?? [];
        arr.push(r.role);
        roleMap.set(r.user_id, arr);
      });
      return (profiles ?? []).map((p: any) => ({ ...p, roles: roleMap.get(p.id) ?? [] }));
    },
  });

  async function toggleAdmin(userId: string, isAdmin: boolean) {
    if (isAdmin) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
      if (error) return toast.error(error.message);
    }
    toast.success("Rôle mis à jour");
    qc.invalidateQueries({ queryKey: ["admin_users"] });
  }

  return (
    <Card className="p-0 overflow-hidden mt-4">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="text-left px-4 py-2 text-xs uppercase text-muted-foreground">Utilisateur</th>
            <th className="text-left px-4 py-2 text-xs uppercase text-muted-foreground">Email</th>
            <th className="text-left px-4 py-2 text-xs uppercase text-muted-foreground">Rôles</th>
            <th className="text-right px-4 py-2 text-xs uppercase text-muted-foreground">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {(data ?? []).map((u: any) => {
            const isAdmin = u.roles.includes("admin");
            return (
              <tr key={u.id}>
                <td className="px-4 py-2">{u.full_name || "—"}</td>
                <td className="px-4 py-2 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-2">
                  {u.roles.map((r: string) => (
                    <Badge key={r} variant="outline" className="mr-1">{r}</Badge>
                  ))}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => toggleAdmin(u.id, isAdmin)}>
                    {isAdmin ? "Retirer admin" : "Promouvoir admin"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
