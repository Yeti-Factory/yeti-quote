import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { hashPassword } from "better-auth/crypto";

const { Pool } = pg;
const exportDir = process.argv[2] || process.env.YETI_QUOTE_EXPORT_DIR;
if (!exportDir) throw new Error("Un chemin d'export ou YETI_QUOTE_EXPORT_DIR est requis");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function json(name) {
  return JSON.parse(await readFile(path.join(exportDir, `${name}.json`), "utf8"));
}

async function upsert(client, table, row, jsonColumns = []) {
  const columns = Object.keys(row);
  const values = columns.map((column) => jsonColumns.includes(column) ? JSON.stringify(row[column]) : row[column]);
  const placeholders = columns.map((column, index) => `$${index + 1}${jsonColumns.includes(column) ? "::jsonb" : ""}`);
  const conflict = table === "app_defaults" ? "key" : "id";
  const updates = columns.filter((column) => column !== conflict).map((column) => `"${column}" = EXCLUDED."${column}"`);
  await client.query(
    `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(",")})
     VALUES (${placeholders.join(",")})
     ON CONFLICT ("${conflict}") DO UPDATE SET ${updates.join(",")}`,
    values,
  );
}

async function main() {
  const [manifestText, defaults, clients, dossiers, profiles, roles, authUsers] = await Promise.all([
    readFile(path.join(exportDir, "manifest.json"), "utf8"),
    json("app_defaults"), json("clients"), json("dossiers"), json("profiles"), json("user_roles"), json("auth_users"),
  ]);
  const roleMap = new Map();
  for (const row of roles.rows) {
    const list = roleMap.get(row.user_id) ?? [];
    list.push(row.role);
    roleMap.set(row.user_id, list);
  }
  const profileMap = new Map(profiles.rows.map((row) => [row.id, row]));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of defaults.rows) await upsert(client, "app_defaults", row, ["value"]);
    for (const row of clients.rows) await upsert(client, "clients", row);
    for (const row of dossiers.rows) await upsert(client, "dossiers", row, ["payload", "results", "params"]);

    for (const legacy of authUsers.rows) {
      const email = String(legacy.email).trim().toLowerCase();
      const existing = await client.query('SELECT id FROM "user" WHERE lower(email) = $1', [email]);
      let userId = existing.rows[0]?.id;
      const legacyRoles = roleMap.get(legacy.id) ?? ["user"];
      const role = legacyRoles.includes("admin") ? "admin" : "user";
      const profile = profileMap.get(legacy.id) ?? {};
      const name = profile.full_name || legacy.raw_user_meta_data?.full_name || email;
      if (!userId) {
        userId = randomUUID();
        const password = randomBytes(32).toString("base64url");
        const passwordHash = await hashPassword(password);
        await client.query(
          `INSERT INTO "user"(id, name, email, "emailVerified", role)
           VALUES ($1, $2, $3, true, $4)`,
          [userId, name, email, role],
        );
        await client.query(
          `INSERT INTO account(id, issuer, "accountId", "providerId", "userId", password)
           VALUES ($1, 'local:credential', $2, 'credential', $2, $3)`,
          [randomUUID(), userId, passwordHash],
        );
      }
      await client.query(
        `INSERT INTO profiles(id, full_name, email) VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email`,
        [userId, name, email],
      );
      await client.query(
        `INSERT INTO user_roles(user_id, role) VALUES ($1, $2::app_role)
         ON CONFLICT (user_id, role) DO NOTHING`,
        [userId, role],
      );
    }

    const counts = {
      auth_users: authUsers.rows.length,
      app_defaults: defaults.rows.length,
      clients: clients.rows.length,
      dossiers: dossiers.rows.length,
      profiles: profiles.rows.length,
      user_roles: roles.rows.length,
    };
    const manifestSha256 = createHash("sha256").update(manifestText).digest("hex");
    await client.query(
      "INSERT INTO migration_imports(source, manifest_sha256, counts) VALUES ($1, $2, $3::jsonb)",
      ["legacy_cloud_export", manifestSha256, JSON.stringify(counts)],
    );
    await client.query("COMMIT");
    console.log(JSON.stringify({ status: "imported", counts, passwords_migrated: false }));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Echec import Yeti Quote", error);
  process.exitCode = 1;
});
