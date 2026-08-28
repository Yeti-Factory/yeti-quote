import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireNativeAuth } from "@/integrations/native/auth-middleware";

const createUserSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(1).max(200),
  isAdmin: z.boolean(),
  mustChangePassword: z.boolean(),
});

export const createUserFn = createServerFn({ method: "POST" })
  .middleware([requireNativeAuth])
  .validator((data: unknown) => createUserSchema.parse(data))
  .handler(async ({ data, context }) => {
    if (!context.isAdmin) throw new Error("Droits administrateur requis");
    const [{ auth }, { pool }] = await Promise.all([
      import("@/lib/auth.server"),
      import("@/lib/db.server"),
    ]);
    const created = await auth.api.createUser({
      body: { email: data.email, password: data.password, name: data.fullName, role: data.isAdmin ? "admin" : "user" },
    });
    const newUserId = created.user.id;
    await pool.query(
      `INSERT INTO profiles(id, email, full_name) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name`,
      [newUserId, data.email, data.fullName],
    );
    await pool.query(
      `INSERT INTO user_roles(user_id, role) VALUES ($1, $2::app_role)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [newUserId, data.isAdmin ? "admin" : "user"],
    );
    return { ok: true, userId: newUserId, passwordResetRequired: data.mustChangePassword };
  });
