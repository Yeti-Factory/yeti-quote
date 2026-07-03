import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inviteSchema = z.object({
  userId: z.string().uuid(),
});

export const sendInstallInviteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inviteSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Admin check
    const { data: adminRow, error: adminErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminErr) throw new Error("Vérification admin impossible");
    if (!adminRow) throw new Error("Forbidden: admin required");

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const EMAIL_FROM = process.env.EMAIL_FROM;
    const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL;

    if (!RESEND_API_KEY || !EMAIL_FROM || !APP_PUBLIC_URL) {
      throw new Error(
        "Configuration email manquante. Renseigner RESEND_API_KEY, EMAIL_FROM et APP_PUBLIC_URL.",
      );
    }

    // Fetch target user email
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", data.userId)
      .maybeSingle();
    if (profileErr || !profile?.email) {
      throw new Error("Utilisateur introuvable ou sans email");
    }

    const installUrl = `${APP_PUBLIC_URL.replace(/\/$/, "")}/install`;
    const logoUrl = `${APP_PUBLIC_URL.replace(/\/$/, "")}/yeti-logo.png`;
    const displayName = profile.full_name || "";

    const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#fff">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#111;border-radius:12px;overflow:hidden">
        <tr><td align="center" style="padding:32px 24px 16px">
          <img src="${logoUrl}" alt="Yeti Factory" width="160" style="display:block;max-width:160px;height:auto"/>
        </td></tr>
        <tr><td style="padding:8px 32px 0;color:#fff;font-size:20px;font-weight:bold" align="center">
          Installation de Yeti Quote
        </td></tr>
        <tr><td style="padding:16px 32px 8px;color:#e5e5e5;font-size:15px;line-height:1.5" align="center">
          Bonjour${displayName ? " " + escapeHtml(displayName) : ""}, vous êtes invité à installer l'application Yeti Quote.
        </td></tr>
        <tr><td align="center" style="padding:24px 32px">
          <a href="${installUrl}" style="display:inline-block;background:#ff7a00;color:#000;font-weight:bold;padding:14px 28px;border-radius:8px;text-decoration:none;font-size:16px">
            Installer Yeti Quote
          </a>
        </td></tr>
        <tr><td style="padding:8px 32px 32px;color:#888;font-size:12px;line-height:1.5" align="center">
          Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br/>
          <a href="${installUrl}" style="color:#ff7a00;word-break:break-all">${installUrl}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const text = `Bonjour${displayName ? " " + displayName : ""},

Vous êtes invité à installer l'application Yeti Quote.

Installer : ${installUrl}
`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [profile.email],
        subject: "Installation de Yeti Quote",
        html,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Envoi email échoué (${res.status}): ${body.slice(0, 200)}`);
    }

    return { ok: true, email: profile.email };
  });

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
