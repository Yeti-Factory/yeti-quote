import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { pool } from "@/lib/db.server";

const text = z.string().trim().max(500).nullable().optional();
const addressSchema = z.object({
  company: text,
  line1: text,
  line2: text,
  line3: text,
  postalCode: text,
  city: text,
  countryCode: text,
  countryName: text,
});
const sageClientSchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: text,
  billingAddress: addressSchema,
  deliveryAddress: addressSchema,
  email: text,
  phone: text,
  mobile: text,
  siret: text,
  vatNumber: text,
  vatMode: text,
  paymentMethodCode: text,
  paymentMethodLabel: text,
  paymentTermCode: text,
  paymentTermLabel: text,
  representativeCode: text,
  representativeName: text,
  contact: z.object({
    title: text,
    name: text,
    company: text,
    role: text,
    email: text,
    phone: text,
    mobile: text,
  }),
});
const responseSchema = z.object({
  requestId: z.string().uuid(),
  source: z.string().trim().min(1).max(200),
  syncedAt: z.string().datetime().optional(),
  client: sageClientSchema.optional(),
  error: z.string().trim().max(2000).optional(),
});

function tokenMatches(request: Request) {
  const expected = process.env.SAGE_CONNECTOR_TOKEN?.trim() ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!expected || !supplied) return false;
  return timingSafeEqual(
    createHash("sha256").update(expected).digest(),
    createHash("sha256").update(supplied).digest(),
  );
}

async function handle(request: Request) {
  if (!tokenMatches(request))
    return Response.json({ error: "Connecteur non autorisé" }, { status: 401 });

  if (request.method === "GET") {
    const source = request.headers.get("x-sage-connector-source")?.trim().slice(0, 200);
    if (!source) return Response.json({ error: "Source manquante" }, { status: 400 });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE sage_sync_requests
         SET status = 'pending', claimed_at = NULL, source = NULL
         WHERE status = 'processing' AND claimed_at < now() - interval '10 minutes'`,
      );
      const result = await client.query<{ id: string; code_sage: string }>(
        `WITH next_request AS (
           SELECT id
           FROM sage_sync_requests
           WHERE status = 'pending'
           ORDER BY requested_at
           LIMIT 1
           FOR UPDATE SKIP LOCKED
         )
         UPDATE sage_sync_requests r
         SET status = 'processing', claimed_at = now(), source = $1
         FROM next_request n
         WHERE r.id = n.id
         RETURNING r.id, r.code_sage`,
        [source],
      );
      await client.query("COMMIT");
      return Response.json({ request: result.rows[0] ?? null });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  try {
    const input = responseSchema.parse(await request.json());
    if (!input.client && !input.error)
      return Response.json({ error: "Résultat Sage manquant" }, { status: 400 });
    const syncedAt = input.syncedAt ? new Date(input.syncedAt) : new Date();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query<{ client_id: string; code_sage: string }>(
        `SELECT client_id, code_sage FROM sage_sync_requests
         WHERE id = $1 AND status = 'processing' AND source = $2
         FOR UPDATE`,
        [input.requestId, input.source],
      );
      if (!claimed.rows[0]) throw new Error("Demande Sage expirée ou déjà traitée");

      if (input.error) {
        await client.query(
          `UPDATE sage_sync_requests
           SET status = 'failed', completed_at = now(), error = $2
           WHERE id = $1`,
          [input.requestId, input.error],
        );
      } else {
        if (input.client!.code.toUpperCase() !== claimed.rows[0].code_sage.trim().toUpperCase())
          throw new Error("Le code renvoyé par Sage ne correspond pas à la demande");
        const sageClient = {
          ...input.client!,
          representativeName:
            input.client!.representativeName || input.client!.representativeCode
              ? input.client!.representativeName
              : "Yovan Nalovic",
        };
        await client.query(
          `UPDATE clients
           SET sage_data = $1::jsonb, sage_synced_at = $2, sage_sync_source = $3
           WHERE id = $4`,
          [JSON.stringify(sageClient), syncedAt, input.source, claimed.rows[0].client_id],
        );
        await client.query(
          `UPDATE sage_sync_requests
           SET status = 'completed', completed_at = now(), error = NULL
           WHERE id = $1`,
          [input.requestId],
        );
      }
      await client.query("COMMIT");
      return Response.json({ status: input.error ? "failed" : "completed" });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Réponse Sage impossible" },
      { status: 400 },
    );
  }
}

export const Route = createFileRoute("/api/sage-connector")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});
