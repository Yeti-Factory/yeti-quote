import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { pool } from "@/lib/db.server";
import { getIdentity } from "@/lib/session.server";

const requestSchema = z.object({ clientId: z.string().uuid() });

async function handle(request: Request) {
  const identity = await getIdentity(request);
  if (!identity) return Response.json({ error: "Session expirée" }, { status: 401 });

  try {
    if (request.method === "POST") {
      const input = requestSchema.parse(await request.json());
      const client = await pool.query<{ code_sage: string | null }>(
        "SELECT code_sage FROM clients WHERE id = $1",
        [input.clientId],
      );
      const code = client.rows[0]?.code_sage?.trim();
      if (!code) return Response.json({ error: "Code client Sage manquant" }, { status: 400 });

      const result = await pool.query<{ id: string }>(
        `INSERT INTO sage_sync_requests (client_id, code_sage, requested_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (client_id) WHERE status IN ('pending', 'processing') DO NOTHING
         RETURNING id`,
        [input.clientId, code, identity.id],
      );
      const active =
        result.rows[0] ??
        (
          await pool.query<{ id: string }>(
            `SELECT id FROM sage_sync_requests
             WHERE client_id = $1 AND status IN ('pending', 'processing')
             ORDER BY requested_at DESC LIMIT 1`,
            [input.clientId],
          )
        ).rows[0];
      if (!active) throw new Error("La demande Sage n’a pas pu être créée");
      return Response.json({ id: active.id, status: "pending" }, { status: 201 });
    }

    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "Demande manquante" }, { status: 400 });
    const result = await pool.query<{
      status: string;
      source: string | null;
      error: string | null;
      completed_at: Date | null;
    }>(
      `SELECT status, source, error, completed_at
       FROM sage_sync_requests
       WHERE id = $1`,
      [id],
    );
    if (!result.rows[0]) return Response.json({ error: "Demande inconnue" }, { status: 404 });
    return Response.json(result.rows[0]);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Demande Sage impossible" },
      { status: 400 },
    );
  }
}

export const Route = createFileRoute("/api/sage-sync")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
