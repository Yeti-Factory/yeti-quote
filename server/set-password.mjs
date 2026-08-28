import { randomUUID } from "node:crypto";
import pg from "pg";
import { hashPassword, verifyPassword } from "better-auth/crypto";

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
let committed = false;

try {
  await client.query("BEGIN");
  const result = await client.query('SELECT id FROM "user" WHERE lower(email) = $1 LIMIT 1', [
    email,
  ]);
  const userId = result.rows[0]?.id;
  if (!userId) throw new Error("Utilisateur introuvable");

  const passwordHash = await hashPassword(password);
  if (!(await verifyPassword({ hash: passwordHash, password }))) {
    throw new Error("La verification locale du mot de passe a echoue");
  }
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
  committed = true;

  const loginResponse = await fetch("http://127.0.0.1:3000/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    },
    body: JSON.stringify({ email, password }),
  });
  await client.query('DELETE FROM "session" WHERE "userId" = $1', [userId]);
  if (!loginResponse.ok) {
    const detail = (await loginResponse.text()).slice(0, 300);
    throw new Error(`La verification de connexion a echoue (${loginResponse.status}) ${detail}`);
  }

  console.log(
    JSON.stringify({
      status: "password_updated",
      login_verified: true,
      sessions_revoked: true,
    }),
  );
} catch (error) {
  if (!committed) await client.query("ROLLBACK");
  console.error(
    "Echec de la reinitialisation locale",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
