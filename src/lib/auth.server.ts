import "@tanstack/react-start/server-only";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { pool } from "./db.server";

const production = process.env.NODE_ENV === "production";
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendPasswordResetEmail({
  user,
  url,
}: {
  user: { email: string; name?: string | null };
  url: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("Envoi d’e-mail non configuré");

  const recipientName = escapeHtml(user.name?.trim() || "");
  const safeUrl = escapeHtml(url);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [user.email],
      subject: "Nouveau mot de passe YetiQuote",
      text: [
        `Bonjour${user.name?.trim() ? ` ${user.name.trim()}` : ""},`,
        "",
        "Vous avez demandé un nouveau mot de passe pour YetiQuote.",
        `Ouvrez ce lien dans l’heure : ${url}`,
        "",
        "Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.",
      ].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;color:#27272a;line-height:1.5;max-width:560px;margin:auto">
        <h2 style="color:#f97316">YetiQuote</h2>
        <p>Bonjour${recipientName ? ` ${recipientName}` : ""},</p>
        <p>Vous avez demandé un nouveau mot de passe pour YetiQuote.</p>
        <p><a href="${safeUrl}" style="display:inline-block;background:#f97316;color:white;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600">Choisir mon nouveau mot de passe</a></p>
        <p style="font-size:13px;color:#71717a">Ce lien expire dans une heure et ne fonctionne qu’une fois.</p>
        <p style="font-size:13px;color:#71717a">Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail.</p>
      </div>`,
    }),
  });
  if (!response.ok) throw new Error("L’e-mail de réinitialisation n’a pas pu être envoyé");
}

export const auth = betterAuth({
  appName: "Yeti Quote",
  database: pool,
  baseURL,
  secret:
    process.env.BETTER_AUTH_SECRET ??
    (production ? undefined : "development-only-secret-change-me-0001"),
  trustedOrigins: [
    baseURL,
    ...(process.env.TRUSTED_ORIGINS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? []),
  ],
  disableSignUp: true,
  advanced: { database: { generateId: "uuid" }, useSecureCookies: production },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: sendPasswordResetEmail,
  },
  plugins: [admin({ defaultRole: "user", adminRoles: ["admin"] })],
});
