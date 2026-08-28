import { createAuthClient } from "better-auth/react";
import type { Session, User } from "./session-types";

type NativeError = { message: string; code?: string };
type Filter = {
  column: string;
  operator: "eq" | "neq" | "in" | "is" | "not_is" | "gte" | "like" | "ilike";
  value: unknown;
};
type QueryResult = { data: any; error: NativeError | null; count?: number | null };

const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? undefined : window.location.origin,
});
const listeners = new Set<(event: string, session: Session | null) => void>();

function nativeError(value: unknown): NativeError {
  if (value && typeof value === "object" && "message" in value)
    return { message: String((value as any).message) };
  return { message: typeof value === "string" ? value : "Une erreur inattendue est survenue" };
}

function nativeUser(value: any): User {
  return {
    id: String(value.id),
    email: value.email ? String(value.email) : null,
    user_metadata: { must_change_password: false, full_name: value.name ?? null },
    app_metadata: { provider: "email", providers: ["email"], role: value.role ?? "user" },
    aud: "authenticated",
    created_at: value.createdAt
      ? new Date(value.createdAt).toISOString()
      : new Date().toISOString(),
  };
}

function nativeSession(value: any): Session | null {
  if (!value?.user || !value?.session) return null;
  const expiresAt = value.session.expiresAt
    ? Math.floor(new Date(value.session.expiresAt).getTime() / 1000)
    : Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: "native-cookie-session",
    refresh_token: "",
    token_type: "bearer",
    expires_at: expiresAt,
    expires_in: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
    user: nativeUser(value.user),
  };
}

async function currentSession(): Promise<Session | null> {
  const response: any = await authClient.getSession({ query: {} });
  return response.error ? null : nativeSession(response.data);
}

async function notify(event: string) {
  const session = await currentSession();
  listeners.forEach((listener) => listener(event, session));
}

function parseOr(expression: string): Filter[] {
  return expression.split(",").flatMap((part) => {
    const match = part.trim().match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.(eq|ilike|like|is)\.(.*)$/);
    if (!match) return [];
    const [, column, operator, raw] = match;
    const value = raw === "null" ? null : raw === "true" ? true : raw === "false" ? false : raw;
    return [{ column, operator: operator as Filter["operator"], value }];
  });
}

class NativeQueryBuilder {
  private operation: "query" | "insert" | "update" | "delete" = "query";
  private payload: unknown;
  private filters: Filter[] = [];
  private orFilters: Filter[] = [];
  private orders: { column: string; ascending: boolean }[] = [];
  private rowLimit?: number;
  private selection = "*";
  private head = false;
  private resultMode: "many" | "single" | "maybeSingle" = "many";

  constructor(private readonly dataset: string) {}
  select(columns = "*", options?: { count?: string; head?: boolean }): this {
    this.selection = columns;
    this.head = options?.head === true;
    return this;
  }
  insert(values: unknown): this {
    this.operation = "insert";
    this.payload = values;
    return this;
  }
  update(values: unknown): this {
    this.operation = "update";
    this.payload = values;
    return this;
  }
  delete(): this {
    this.operation = "delete";
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push({ column, operator: "eq", value });
    return this;
  }
  neq(column: string, value: unknown): this {
    this.filters.push({ column, operator: "neq", value });
    return this;
  }
  in(column: string, value: unknown[]): this {
    this.filters.push({ column, operator: "in", value });
    return this;
  }
  is(column: string, value: unknown): this {
    this.filters.push({ column, operator: "is", value });
    return this;
  }
  not(column: string, operator: string, value: unknown): this {
    this.filters.push({ column, operator: operator === "is" ? "not_is" : "neq", value });
    return this;
  }
  gte(column: string, value: unknown): this {
    this.filters.push({ column, operator: "gte", value });
    return this;
  }
  like(column: string, value: unknown): this {
    this.filters.push({ column, operator: "like", value });
    return this;
  }
  ilike(column: string, value: unknown): this {
    this.filters.push({ column, operator: "ilike", value });
    return this;
  }
  or(expression: string): this {
    this.orFilters.push(...parseOr(expression));
    return this;
  }
  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: options?.ascending !== false });
    return this;
  }
  limit(value: number): this {
    this.rowLimit = value;
    return this;
  }
  range(from: number, to: number): this {
    this.rowLimit = Math.max(1, to - from + 1);
    return this;
  }
  single(): this {
    this.resultMode = "single";
    return this;
  }
  maybeSingle(): this {
    this.resultMode = "maybeSingle";
    return this;
  }

  private async execute(): Promise<QueryResult> {
    try {
      const body =
        this.operation === "query"
          ? {
              filters: this.filters,
              orFilters: this.orFilters,
              order: this.orders,
              limit: this.rowLimit,
              select: this.selection,
            }
          : this.operation === "insert"
            ? { values: this.payload }
            : this.operation === "update"
              ? { values: this.payload, filters: this.filters }
              : { filters: this.filters };
      const response = await fetch(
        `/api/data/${encodeURIComponent(this.dataset)}/${this.operation}`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok)
        return { data: null, error: nativeError(json.error ?? response.statusText), count: null };
      const rows = Array.isArray(json.data) ? json.data : [];
      if (this.head) return { data: null, error: null, count: Number(json.count ?? rows.length) };
      if (this.resultMode === "single")
        return rows.length === 1
          ? { data: rows[0], error: null }
          : { data: null, error: { message: `Une ligne attendue, ${rows.length} reçue(s)` } };
      if (this.resultMode === "maybeSingle")
        return rows.length <= 1
          ? { data: rows[0] ?? null, error: null }
          : { data: null, error: { message: `Au plus une ligne attendue, ${rows.length} reçues` } };
      return { data: rows, error: null, count: json.count ?? null };
    } catch (error) {
      return { data: null, error: nativeError(error), count: null };
    }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

const auth = {
  async getSession() {
    try {
      return { data: { session: await currentSession() }, error: null };
    } catch (error) {
      return { data: { session: null }, error: nativeError(error) };
    }
  },
  async signInWithPassword(credentials: { email: string; password: string }) {
    const response: any = await authClient.signIn.email(credentials);
    if (response.error) return { data: null, error: nativeError(response.error) };
    await notify("SIGNED_IN");
    return {
      data: { user: nativeUser(response.data.user), session: await currentSession() },
      error: null,
    };
  },
  async signOut() {
    const response: any = await authClient.signOut({});
    if (response.error) return { error: nativeError(response.error) };
    await notify("SIGNED_OUT");
    return { error: null };
  },
  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    listeners.add(callback);
    queueMicrotask(async () => callback("INITIAL_SESSION", await currentSession()));
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            listeners.delete(callback);
          },
        },
      },
    };
  },
};

export const backend = {
  from(dataset: string) {
    return new NativeQueryBuilder(dataset);
  },
  auth,
};
