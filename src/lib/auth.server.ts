import "@tanstack/react-start/server-only";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { pool } from "./db.server";

const production = process.env.NODE_ENV === "production";
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
}

async function sendResetPassword({ user, url }: { user: { email: string; name: string }; url: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) throw new Error("Configuration Resend manquante");
  const safeName = escapeHtml(user.name || "");
  const safeUrl = escapeHtml(url);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [user.email],
      subject: "Réinitialisation de votre mot de passe Yeti Quote",
      text: `Bonjour ${user.name || ""},\n\nCréez votre nouveau mot de passe Yeti Quote : ${url}\n`,
      html: `<p>Bonjour ${safeName},</p><p>Créez votre nouveau mot de passe Yeti Quote :</p><p><a href="${safeUrl}">Réinitialiser mon mot de passe</a></p>`,
    }),
  });
  if (!response.ok) throw new Error(`Envoi du lien impossible (${response.status})`);
}

export const auth = betterAuth({
  appName: "Yeti Quote",
  database: pool,
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET ?? (production ? undefined : "development-only-secret-change-me-0001"),
  trustedOrigins: [
    baseURL,
    ...(process.env.TRUSTED_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) ?? []),
  ],
  disableSignUp: true,
  advanced: { database: { generateId: "uuid" }, useSecureCookies: production },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword,
  },
  plugins: [admin({ defaultRole: "user", adminRoles: ["admin"] })],
});
