import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, useIsAdmin } from "@/hooks/useAuth";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { createUserFn } from "@/lib/admin-users.functions";

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
        <TabsContent value="coefs">
          <CoefsPanel />
        </TabsContent>
        <TabsContent value="users">
          <UsersPanel />
        </TabsContent>
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
            <Button size="sm" onClick={() => save(d.key)}>
              Enregistrer
            </Button>
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
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .eq("role", "admin");
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });
      if (error) return toast.error(error.message);
    }
    toast.success("Rôle mis à jour");
    qc.invalidateQueries({ queryKey: ["admin_users"] });
  }

  return (

    <div className="mt-4 space-y-4">
      <CreateUserForm />
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <th className="text-left px-4 py-2 text-xs uppercase text-muted-foreground">
                Utilisateur
              </th>
              <th className="text-left px-4 py-2 text-xs uppercase text-muted-foreground">
                Email
              </th>
              <th className="text-left px-4 py-2 text-xs uppercase text-muted-foreground">
                Rôles
              </th>
              <th className="text-right px-4 py-2 text-xs uppercase text-muted-foreground">
                Action
              </th>
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
                      <Badge key={r} variant="outline" className="mr-1">
                        {r}
                      </Badge>
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
    </div>
  );
}

function CreateUserForm() {
  const qc = useQueryClient();
  const createUser = useServerFn(createUserFn);
  const [fullName, setFullName] = useState("Anne Bousseau");
  const [email, setEmail] = useState("a.bousseau@yeti-factory.com");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(true);
  const [mustChange, setMustChange] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Mot de passe : 8 caractères minimum");
    setBusy(true);
    try {
      await createUser({
        data: {
          email,
          password,
          fullName,
          isAdmin,
          mustChangePassword: mustChange,
        },
      });
      toast.success("Utilisateur créé");
      setPassword("");
      qc.invalidateQueries({ queryKey: ["admin_users"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h3 className="font-semibold mb-3">Créer un utilisateur</h3>
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label htmlFor="cu-name">Nom</Label>
          <Input
            id="cu-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="cu-email">Email</Label>
          <Input
            id="cu-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="cu-pw">Mot de passe provisoire</Label>
          <div className="relative">
            <Input
              id="cu-pw"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="pr-10"
              placeholder="Saisir un mot de passe provisoire"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
              aria-label={showPw ? "Masquer" : "Afficher"}
              tabIndex={-1}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between border rounded-md px-3 py-2">
          <Label htmlFor="cu-admin" className="cursor-pointer">
            Admin
          </Label>
          <Switch id="cu-admin" checked={isAdmin} onCheckedChange={setIsAdmin} />
        </div>
        <div className="flex items-center justify-between border rounded-md px-3 py-2">
          <Label htmlFor="cu-change" className="cursor-pointer">
            Changer au login
          </Label>
          <Switch id="cu-change" checked={mustChange} onCheckedChange={setMustChange} />
        </div>
        <div className="md:col-span-2 flex justify-end">
          <Button type="submit" disabled={busy}>
            {busy ? "…" : "Créer l'utilisateur"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

