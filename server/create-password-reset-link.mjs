import { randomBytes, randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const email = String(process.env.YETI_QUOTE_ADMIN_EMAIL ?? "")
  .trim()
  .toLowerCase();

if (!email) throw new Error("YETI_QUOTE_ADMIN_EMAIL est requis");

const baseURL = String(process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "");
if (!baseURL.startsWith("https://")) {
  throw new Error("BETTER_AUTH_URL doit etre une URL HTTPS");
}

const token = randomBytes(32).toString("base64url");
const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const result = await client.query('SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1', [
    email,
  ]);
  const userId = result.rows[0]?.id;
  if (!userId) throw new Error("Utilisateur introuvable");

  await client.query(
    `DELETE FROM verification
     WHERE identifier LIKE 'reset-password:%' AND value = $1`,
    [userId],
  );
  await client.query(
    `INSERT INTO verification(id, identifier, value, "expiresAt")
     VALUES ($1, $2, $3, $4)`,
    [randomUUID(), `reset-password:${token}`, userId, expiresAt],
  );
  await client.query("COMMIT");

  console.log(
    JSON.stringify({
      status: "reset_link_created",
      reset_url: `${baseURL}/reset-password?token=${encodeURIComponent(token)}`,
      expires_at: expiresAt.toISOString(),
    }),
  );
} catch (error) {
  await client.query("ROLLBACK");
  console.error(
    "Echec de creation du lien de reinitialisation",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
