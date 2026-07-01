import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const createUserSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(1).max(200),
  isAdmin: z.boolean(),
  mustChangePassword: z.boolean(),
});

export const createUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createUserSchema.parse(data))
  .handler(async ({ data, context }) => {
    // Verify caller is admin (RLS-scoped read on user_roles)
    const { data: adminRow, error: adminErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminErr) throw new Error("Vérification admin impossible");
    if (!adminRow) throw new Error("Forbidden: admin required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        must_change_password: data.mustChangePassword,
      },
    });
    if (createErr || !created?.user) {
      throw new Error(createErr?.message ?? "Création utilisateur échouée");
    }

    const newUserId = created.user.id;

    // Upsert profile (handle_new_user trigger already inserts one; keep name in sync)
    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: newUserId, email: data.email, full_name: data.fullName },
        { onConflict: "id" },
      );
    if (profileErr) throw new Error(profileErr.message);

    if (data.isAdmin) {
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: newUserId, role: "admin" });
      if (roleErr && !/duplicate|unique/i.test(roleErr.message)) {
        throw new Error(roleErr.message);
      }
    }

    return { ok: true, userId: newUserId };
  });
