import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const requireNativeAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  if (!request) throw new Error("Session introuvable");
  const [{ auth }, { pool }] = await Promise.all([
    import("@/lib/auth.server"),
    import("@/lib/db.server"),
  ]);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new Error("Session expirée");
  const roles = await pool.query<{ role: string }>(
    "SELECT role::text AS role FROM user_roles WHERE user_id = $1",
    [session.user.id],
  );
  return next({
    context: {
      userId: session.user.id,
      email: session.user.email,
      isAdmin: roles.rows.some((row) => row.role === "admin"),
    },
  });
});
