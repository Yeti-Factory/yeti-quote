import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { backend } from "@/integrations/native/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

type AuthSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Connexion — Yeti Factory" }] }),
  validateSearch: (raw: Record<string, unknown>): AuthSearch => ({
    redirect: typeof raw.redirect === "string" ? raw.redirect : undefined,
  }),
  component: AuthPage,
});

function PasswordInput({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        minLength={12}
        autoComplete="current-password"
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((current) => !current)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
        aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function AuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    backend.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <img
            src="/yeti-logo.png"
            alt="Yeti Factory"
            className="h-16 w-auto object-contain mb-3"
          />
          <div className="text-sm text-muted-foreground">Calcul de prix interne</div>
        </div>
        <LoginForm />
      </Card>
      <Toaster />
    </div>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await backend.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Connexion réussie");
      navigate({ to: "/dashboard", replace: true });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function requestReset(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.message ?? "Impossible d’envoyer le lien");
      }
      setResetSent(true);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Impossible d’envoyer le lien");
    } finally {
      setBusy(false);
    }
  }

  if (forgotMode) {
    return (
      <>
        <h1 className="mb-1 text-xl font-semibold">Mot de passe oublié</h1>
        {resetSent ? (
          <>
            <div className="my-5 rounded-md border border-green-600/30 bg-green-500/10 p-4 text-sm">
              Si cette adresse correspond à un compte YetiQuote, un lien vient d’être envoyé. Pensez
              à vérifier les courriers indésirables.
            </div>
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                setForgotMode(false);
                setResetSent(false);
              }}
            >
              Retour à la connexion
            </Button>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm text-muted-foreground">
              Saisissez votre adresse Yeti Factory. Vous recevrez un lien pour choisir un nouveau
              mot de passe.
            </p>
            <form onSubmit={requestReset} className="space-y-3">
              <div>
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Envoi…" : "Recevoir le lien"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setForgotMode(false)}
              >
                Retour à la connexion
              </Button>
            </form>
          </>
        )}
      </>
    );
  }

  return (
    <>
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
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Mot de passe</Label>
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => {
                setForgotMode(true);
                setResetSent(false);
              }}
            >
              Mot de passe oublié ?
            </button>
          </div>
          <PasswordInput id="password" value={password} onChange={setPassword} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? "…" : "Se connecter"}
        </Button>
      </form>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Pour créer un nouvel accès, contactez l’administrateur Yeti Factory.
      </p>
    </>
  );
}
