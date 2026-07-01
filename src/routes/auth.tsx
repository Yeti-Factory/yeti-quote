import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Connexion — Yeti Factory" }] }),
  component: AuthPage,
});

// Inscription publique désactivée : l'app est interne (www.yeti-lab.fr).
// Les nouveaux comptes doivent être créés par un administrateur via le
// panneau Administration → Utilisateurs (ou directement en base).
const ALLOW_PUBLIC_SIGNUP = false;

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Connexion réussie");
      navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <img src="/yeti-logo.png" alt="Yeti Factory" className="h-16 w-auto object-contain mb-3" />
          <div className="text-sm text-muted-foreground">Calcul de prix interne</div>
        </div>
        <h1 className="text-xl font-semibold mb-1">Connexion</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Accès réservé aux utilisateurs Yeti Factory.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <Label htmlFor="password">Mot de passe</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "…" : "Se connecter"}
          </Button>
        </form>
        {!ALLOW_PUBLIC_SIGNUP && (
          <p className="text-xs text-muted-foreground mt-4 text-center">
            Pas encore de compte ? Contactez un administrateur.
          </p>
        )}
      </Card>
      <Toaster />
    </div>
  );
}

// Helper to enforce redirect guard from other routes
export function requireAuthRedirect(href: string) {
  throw redirect({ to: "/auth", search: { redirect: href } });
}
