import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { pool } from "@/lib/db.server";
import { getIdentity } from "@/lib/session.server";

const tables = {
  app_defaults: ["key", "value", "updated_at"],
  clients: [
    "id",
    "entreprise",
    "contact",
    "email",
    "telephone",
    "adresse",
    "notes",
    "created_by",
    "created_at",
    "updated_at",
  ],
  dossiers: [
    "id",
    "reference",
    "objet",
    "client_id",
    "contact",
    "email",
    "type",
    "statut",
    "onedrive_note",
    "payload",
    "results",
    "params",
    "created_by",
    "created_at",
    "updated_at",
    "version",
  ],
  profiles: ["id", "full_name", "email", "created_at", "updated_at"],
  user_roles: ["id", "user_id", "role", "created_at"],
} as const;

type TableName = keyof typeof tables;
type Filter = {
  column: string;
  operator: "eq" | "neq" | "in" | "is" | "not_is" | "gte" | "like" | "ilike";
  value: unknown;
};

const filterSchema = z.object({
  column: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  operator: z.enum(["eq", "neq", "in", "is", "not_is", "gte", "like", "ilike"]),
  value: z.unknown(),
});
const querySchema = z.object({
  filters: z.array(filterSchema).default([]),
  orFilters: z.array(filterSchema).default([]),
  order: z.array(z.object({ column: z.string(), ascending: z.boolean() })).default([]),
  limit: z.number().int().min(1).max(5000).optional(),
  select: z.string().optional(),
});
const valuesSchema = z.record(z.string(), z.unknown());
const insertSchema = z.object({ values: z.union([valuesSchema, z.array(valuesSchema)]) });
const updateSchema = z.object({ values: valuesSchema, filters: z.array(filterSchema).min(1) });
const deleteSchema = z.object({ filters: z.array(filterSchema).min(1) });

function isTable(value: string): value is TableName {
  return Object.prototype.hasOwnProperty.call(tables, value);
}

function assertColumn(table: TableName, column: string): string {
  if (!(tables[table] as readonly string[]).includes(column))
    throw new Error(`Colonne interdite : ${column}`);
  return `t."${column}"`;
}

function whereSql(table: TableName, filters: Filter[], params: unknown[], joiner: "AND" | "OR") {
  const parts = filters.map((filter) => {
    const column = assertColumn(table, filter.column);
    if (filter.operator === "is")
      return filter.value === null
        ? `${column} IS NULL`
        : `${column} IS ${filter.value === true ? "TRUE" : "FALSE"}`;
    if (filter.operator === "not_is")
      return filter.value === null
        ? `${column} IS NOT NULL`
        : `${column} IS NOT ${filter.value === true ? "TRUE" : "FALSE"}`;
    if (filter.operator === "in") {
      if (!Array.isArray(filter.value)) throw new Error("Le filtre in attend une liste");
      const placeholders = filter.value.map((value) => `$${params.push(value)}`);
      return placeholders.length ? `${column} IN (${placeholders.join(",")})` : "FALSE";
    }
    const position = params.push(filter.value);
    const operator = { eq: "=", neq: "<>", gte: ">=", like: "LIKE", ilike: "ILIKE" }[
      filter.operator
    ];
    return `${column} ${operator} $${position}`;
  });
  return parts.length ? `(${parts.join(` ${joiner} `)})` : "";
}

function buildWhere(table: TableName, filters: Filter[], orFilters: Filter[] = []) {
  const params: unknown[] = [];
  const andPart = whereSql(table, filters, params, "AND");
  const orPart = whereSql(table, orFilters, params, "OR");
  const parts = [andPart, orPart].filter(Boolean);
  return { sql: parts.length ? ` WHERE ${parts.join(" AND ")}` : "", params };
}

function writableValues(table: TableName, input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key, value]) => value !== undefined && (tables[table] as readonly string[]).includes(key),
    ),
  );
}

async function syncAuthenticationRole(userId: unknown) {
  if (typeof userId !== "string" || !userId) return;
  await pool.query(
    `UPDATE "user" u
     SET role = CASE
       WHEN EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id AND r.role = 'admin') THEN 'admin'
       ELSE 'user'
     END
     WHERE u.id = $1`,
    [userId],
  );
}

async function handle(request: Request, params: { dataset: string; operation: string }) {
  const identity = await getIdentity(request);
  if (!identity) return Response.json({ error: "Session expirée" }, { status: 401 });
  if (!isTable(params.dataset)) return Response.json({ error: "Table inconnue" }, { status: 404 });
  const table = params.dataset;
  const body = await request.json().catch(() => ({}));

  try {
    if (params.operation === "query") {
      const input = querySchema.parse(body);
      const where = buildWhere(table, input.filters, input.orFilters);
      let relations = "";
      let join = "";
      if (table === "dossiers" && input.select?.includes("clients(")) {
        relations =
          ", CASE WHEN c.id IS NULL THEN NULL ELSE json_build_object('entreprise', c.entreprise) END AS clients";
        join = " LEFT JOIN clients c ON c.id = t.client_id";
      } else if (table === "clients" && input.select?.includes("dossiers(count)")) {
        relations =
          ", json_build_array(json_build_object('count', (SELECT count(*) FROM dossiers d WHERE d.client_id = t.id))) AS dossiers";
      }
      const order = input.order.length
        ? ` ORDER BY ${input.order.map((item) => `${assertColumn(table, item.column)} ${item.ascending ? "ASC" : "DESC"} NULLS LAST`).join(", ")}`
        : "";
      const limit = input.limit ? ` LIMIT ${input.limit}` : "";
      const result = await pool.query(
        `SELECT t.*${relations} FROM "${table}" t${join}${where.sql}${order}${limit}`,
        where.params,
      );
      return Response.json({ data: result.rows, count: result.rowCount });
    }

    if (params.operation === "insert") {
      const input = insertSchema.parse(body);
      const values = Array.isArray(input.values) ? input.values : [input.values];
      const inserted: unknown[] = [];
      for (const raw of values) {
        const clean = writableValues(table, raw);
        if (table === "dossiers" && !String(clean.reference ?? "").trim()) delete clean.reference;
        const columns = Object.keys(clean);
        const sql = columns.length
          ? `INSERT INTO "${table}" (${columns.map((key) => `"${key}"`).join(",")}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(",")}) RETURNING *`
          : `INSERT INTO "${table}" DEFAULT VALUES RETURNING *`;
        const result = await pool.query(
          sql,
          columns.map((key) => clean[key]),
        );
        inserted.push(result.rows[0]);
        if (table === "user_roles") await syncAuthenticationRole(result.rows[0]?.user_id);
      }
      return Response.json({ data: inserted }, { status: 201 });
    }

    if (params.operation === "update") {
      const input = updateSchema.parse(body);
      if ((table === "app_defaults" || table === "user_roles") && !identity.isAdmin)
        return Response.json({ error: "Droits administrateur requis" }, { status: 403 });
      const values = writableValues(table, input.values);
      delete values.id;
      const entries = Object.entries(values);
      if (!entries.length) return Response.json({ data: [] });
      const where = buildWhere(table, input.filters);
      const setParams = entries.map(([, value]) => value);
      const shiftedWhere = where.sql.replace(
        /\$(\d+)/g,
        (_, n) => `$${Number(n) + setParams.length}`,
      );
      const set = entries.map(([key], index) => `"${key}" = $${index + 1}`).join(",");
      const result = await pool.query(
        `UPDATE "${table}" t SET ${set}${(tables[table] as readonly string[]).includes("updated_at") ? ", updated_at = now()" : ""}${shiftedWhere} RETURNING t.*`,
        [...setParams, ...where.params],
      );
      if (table === "user_roles") {
        for (const row of result.rows) await syncAuthenticationRole(row.user_id);
      }
      return Response.json({ data: result.rows });
    }

    if (params.operation === "delete") {
      const input = deleteSchema.parse(body);
      if (
        (table === "clients" ||
          table === "dossiers" ||
          table === "user_roles" ||
          table === "app_defaults") &&
        !identity.isAdmin
      )
        return Response.json({ error: "Droits administrateur requis" }, { status: 403 });
      const where = buildWhere(table, input.filters);
      const result = await pool.query(
        `DELETE FROM "${table}" t${where.sql} RETURNING t.*`,
        where.params,
      );
      if (table === "user_roles") {
        for (const row of result.rows) await syncAuthenticationRole(row.user_id);
      }
      return Response.json({ data: result.rows });
    }

    return Response.json({ error: "Opération inconnue" }, { status: 404 });
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Erreur serveur";
    return Response.json({ error: message }, { status: 400 });
  }
}

export const Route = createFileRoute("/api/data/$dataset/$operation")({
  server: { handlers: { POST: ({ request, params }) => handle(request, params) } },
});
