import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

type AuthMode = "login" | "forgot" | "reset-password" | "change-password";

type AuthSearch = {
  mode?: AuthMode;
  redirect?: string;
};

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Connexion — Yeti Factory" }] }),
  validateSearch: (raw: Record<string, unknown>): AuthSearch => {
    const allowed: AuthMode[] = ["login", "forgot", "reset-password", "change-password"];
    const mode =
      typeof raw.mode === "string" && (allowed as string[]).includes(raw.mode)
        ? (raw.mode as AuthMode)
        : undefined;
    const redirectTo = typeof raw.redirect === "string" ? raw.redirect : undefined;
    return { mode, redirect: redirectTo };
  },
  component: AuthPage,
});

const ALLOW_PUBLIC_SIGNUP = false;

function validateStrongPassword(pw: string): string | null {
  if (pw.length < 8) return "8 caractères minimum";
  if (!/[A-Z]/.test(pw)) return "Au moins une majuscule";
  if (!/[a-z]/.test(pw)) return "Au moins une minuscule";
  if (!/[0-9]/.test(pw)) return "Au moins un chiffre";
  if (!/[^A-Za-z0-9]/.test(pw)) return "Au moins un caractère spécial";
  return null;
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  required,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
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
  const search = Route.useSearch();
  const mode: AuthMode = search.mode ?? "login";

  useEffect(() => {
    // Only auto-redirect away from /auth when session exists AND we are not in
    // a password change/reset flow (recovery hash sets a session too).
    if (mode === "reset-password" || mode === "change-password") return;
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) return;
      const meta = (data.session.user.user_metadata ?? {}) as { must_change_password?: boolean };
      if (meta.must_change_password) {
        navigate({ to: "/auth", search: { mode: "change-password" }, replace: true });
      } else {
        navigate({ to: "/dashboard", replace: true });
      }
    });
  }, [navigate, mode]);

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
        {mode === "login" && <LoginForm />}
        {mode === "forgot" && <ForgotForm />}
        {mode === "reset-password" && <NewPasswordForm origin="reset" />}
        {mode === "change-password" && <NewPasswordForm origin="change" />}
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const meta = (data.user?.user_metadata ?? {}) as { must_change_password?: boolean };
      if (meta.must_change_password) {
        toast.info("Veuillez définir un nouveau mot de passe");
        navigate({ to: "/auth", search: { mode: "change-password" }, replace: true });
      } else {
        toast.success("Connexion réussie");
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
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
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Mot de passe</Label>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={() => navigate({ to: "/auth", search: { mode: "forgot" } })}
            >
              Mot de passe oublié&nbsp;?
            </button>
          </div>
          <PasswordInput
            id="password"
            value={password}
            onChange={setPassword}
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
          Pas encore de compte&nbsp;? Contactez un administrateur.
        </p>
      )}
    </>
  );
}

function ForgotForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const redirectTo = `${window.location.origin}/auth?mode=reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (error) throw error;
      setSent(true);
      toast.success("Email de réinitialisation envoyé");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="text-xl font-semibold mb-1">Mot de passe oublié</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Recevez un lien pour définir un nouveau mot de passe.
      </p>
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm">
            Si un compte existe pour <span className="font-medium">{email}</span>, un email vient
            d&apos;être envoyé.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => navigate({ to: "/auth", search: { mode: "login" } })}
          >
            Retour à la connexion
          </Button>
        </div>
      ) : (
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
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "…" : "Envoyer le lien"}
          </Button>
          <button
            type="button"
            className="w-full text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => navigate({ to: "/auth", search: { mode: "login" } })}
          >
            Retour à la connexion
          </button>
        </form>
      )}
    </>
  );
}

function NewPasswordForm({ origin }: { origin: "reset" | "change" }) {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    // For the reset flow, Supabase parses the recovery hash and emits a
    // PASSWORD_RECOVERY event with an active session. For change-password,
    // the user is already signed in.
    supabase.auth.getSession().then(({ data }) => setHasSession(!!data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setHasSession(!!s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const pwError = useMemo(() => (pw ? validateStrongPassword(pw) : null), [pw]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateStrongPassword(pw);
    if (err) return toast.error(err);
    if (pw !== confirm) return toast.error("Les mots de passe ne correspondent pas");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: pw,
        data: { must_change_password: false },
      });
      if (error) throw error;
      toast.success("Mot de passe mis à jour");
      navigate({ to: "/dashboard", replace: true });
    } catch (err2: unknown) {
      toast.error(err2 instanceof Error ? err2.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const title = origin === "change" ? "Créer votre mot de passe" : "Nouveau mot de passe";
  const subtitle =
    origin === "change"
      ? "Première connexion : définissez votre mot de passe personnel."
      : "Choisissez un nouveau mot de passe.";

  if (hasSession === false) {
    return (
      <>
        <h1 className="text-xl font-semibold mb-1">Lien expiré</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Le lien de réinitialisation est invalide ou a expiré.
        </p>
        <Button
          className="w-full"
          onClick={() => navigate({ to: "/auth", search: { mode: "forgot" } })}
        >
          Redemander un lien
        </Button>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold mb-1">{title}</h1>
      <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <Label htmlFor="new-pw">Nouveau mot de passe</Label>
          <PasswordInput
            id="new-pw"
            value={pw}
            onChange={setPw}
            required
            minLength={8}
            autoComplete="new-password"
          />
          {pwError && <p className="text-xs text-destructive mt-1">{pwError}</p>}
          {!pwError && (
            <p className="text-xs text-muted-foreground mt-1">
              8 caractères min, majuscule, minuscule, chiffre, caractère spécial.
            </p>
          )}
        </div>
        <div>
          <Label htmlFor="confirm-pw">Confirmer</Label>
          <PasswordInput
            id="confirm-pw"
            value={confirm}
            onChange={setConfirm}
            required
            minLength={8}
            autoComplete="new-password"
          />
          {confirm && confirm !== pw && (
            <p className="text-xs text-destructive mt-1">Les mots de passe ne correspondent pas</p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={busy || hasSession === null}>
          {busy ? "…" : "Enregistrer"}
        </Button>
      </form>
    </>
  );
}
