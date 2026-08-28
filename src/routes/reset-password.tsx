import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ResetSearch = {
  token?: string;
};

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Nouveau mot de passe — Yeti Factory" }] }),
  validateSearch: (raw: Record<string, unknown>): ResetSearch => ({
    token: typeof raw.token === "string" ? raw.token : undefined,
  }),
  component: ResetPasswordPage,
});

function PasswordField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          tabIndex={-1}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function ResetPasswordPage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(undefined);
    if (!token) {
      setError("Ce lien est invalide ou incomplet.");
      return;
    }
    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password, token }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.message ?? "Le lien est invalide, expiré ou déjà utilisé.");
      }
      navigate({ to: "/auth", replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }

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
        <h1 className="text-xl font-semibold mb-1">Nouveau mot de passe</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Choisissez au moins 12 caractères. Ce lien est personnel et à usage unique.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <PasswordField
            id="new-password"
            label="Nouveau mot de passe"
            value={password}
            onChange={setPassword}
          />
          <PasswordField
            id="confirm-password"
            label="Confirmer le mot de passe"
            value={confirmation}
            onChange={setConfirmation}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy || !token}>
            {busy ? "Validation…" : "Enregistrer le nouveau mot de passe"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
