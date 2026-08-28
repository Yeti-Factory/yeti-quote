import { randomUUID } from "node:crypto";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

const { Pool } = pg;
const email = String(process.env.YETI_QUOTE_ADMIN_EMAIL ?? "")
  .trim()
  .toLowerCase();
const password = process.env.YETI_QUOTE_NEW_PASSWORD ?? "";

if (!email) throw new Error("YETI_QUOTE_ADMIN_EMAIL est requis");
if (password.length < 12 || password.length > 128) {
  throw new Error("Le mot de passe doit contenir entre 12 et 128 caracteres");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  const result = await client.query('SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1', [
    email,
  ]);
  const userId = result.rows[0]?.id;
  if (!userId) throw new Error("Utilisateur introuvable");

  const passwordHash = await hashPassword(password);
  const updated = await client.query(
    `UPDATE account SET password = $1, "updatedAt" = now()
     WHERE "userId" = $2 AND "providerId" = 'credential'`,
    [passwordHash, userId],
  );
  if (updated.rowCount === 0) {
    await client.query(
      `INSERT INTO account(id, issuer, "accountId", "providerId", "userId", password)
       VALUES ($1, 'local:credential', $2, 'credential', $2, $3)`,
      [randomUUID(), userId, passwordHash],
    );
  }
  await client.query('DELETE FROM "session" WHERE "userId" = $1', [userId]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ status: "password_updated", sessions_revoked: true }));
} catch (error) {
  await client.query("ROLLBACK");
  console.error(
    "Echec de la reinitialisation locale",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
