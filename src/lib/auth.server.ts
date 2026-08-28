import "@tanstack/react-start/server-only";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { pool } from "./db.server";

const production = process.env.NODE_ENV === "production";
const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  appName: "Yeti Quote",
  database: pool,
  baseURL,
  secret:
    process.env.BETTER_AUTH_SECRET ??
    (production ? undefined : "development-only-secret-change-me-0001"),
  trustedOrigins: [
    baseURL,
    ...(process.env.TRUSTED_ORIGINS?.split(",")
      .map((value) => value.trim())
      .filter(Boolean) ?? []),
  ],
  disableSignUp: true,
  advanced: { database: { generateId: "uuid" }, useSecureCookies: production },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  plugins: [admin({ defaultRole: "user", adminRoles: ["admin"] })],
});
