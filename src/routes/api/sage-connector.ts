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
const syncSchema = z.object({
  source: z.string().trim().min(1).max(200),
  syncedAt: z.string().datetime().optional(),
  clients: z.array(sageClientSchema).max(5000),
});

function tokenMatches(request: Request) {
  const expected = process.env.SAGE_CONNECTOR_TOKEN?.trim() ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!expected || !supplied) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const suppliedHash = createHash("sha256").update(supplied).digest();
  return timingSafeEqual(expectedHash, suppliedHash);
}

async function handle(request: Request) {
  if (!tokenMatches(request))
    return Response.json({ error: "Connecteur non autorisé" }, { status: 401 });

  if (request.method === "GET") {
    const result = await pool.query<{ code_sage: string }>(
      `SELECT DISTINCT btrim(code_sage) AS code_sage
       FROM clients
       WHERE code_sage IS NOT NULL AND btrim(code_sage) <> ''
       ORDER BY btrim(code_sage)`,
    );
    return Response.json({ codes: result.rows.map((row) => row.code_sage) });
  }

  try {
    const input = syncSchema.parse(await request.json());
    const syncedAt = input.syncedAt ? new Date(input.syncedAt) : new Date();
    let updated = 0;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const sageClient of input.clients) {
        const result = await client.query(
          `UPDATE clients
           SET sage_data = $1::jsonb,
               sage_synced_at = $2,
               sage_sync_source = $3,
               updated_at = now()
           WHERE upper(btrim(code_sage)) = upper(btrim($4))`,
          [JSON.stringify(sageClient), syncedAt, input.source, sageClient.code],
        );
        updated += result.rowCount ?? 0;
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    return Response.json({
      received: input.clients.length,
      updated,
      syncedAt: syncedAt.toISOString(),
    });
  } catch (error) {
    console.error("Sage connector sync failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Synchronisation Sage impossible" },
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
