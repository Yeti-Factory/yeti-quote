import "@tanstack/react-start/server-only";
import { auth } from "./auth.server";
import { pool } from "./db.server";

export type Identity = { id: string; email: string; name: string; isAdmin: boolean };

export async function getIdentity(request: Request): Promise<Identity | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  const roles = await pool.query<{ role: string }>(
    "SELECT role::text AS role FROM user_roles WHERE user_id = $1",
    [session.user.id],
  );
  const isAdmin = roles.rows.some((row) => row.role === "admin");
  return { id: session.user.id, email: session.user.email, name: session.user.name, isAdmin };
}
