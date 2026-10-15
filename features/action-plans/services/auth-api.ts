import { z } from "zod";
import { sessionUserSchema, type SessionUser } from "@/lib/schemas/action-plan";
import { apiRequest } from "./api-client";

const meResponse = z.object({ user: sessionUserSchema.nullable() });
const loginResponse = z.object({ user: sessionUserSchema });
const personasResponse = z.object({ personas: z.array(sessionUserSchema) });
const okResponse = z.object({ ok: z.literal(true) });

export type { SessionUser };

export async function fetchCurrentUser() {
  const result = await apiRequest("/api/auth/me", { schema: meResponse });

  return result.ok ? { ok: true as const, data: result.data.user } : result;
}

export async function fetchPersonas() {
  const result = await apiRequest("/api/auth/personas", {
    schema: personasResponse,
  });

  return result.ok ? { ok: true as const, data: result.data.personas } : result;
}

export async function signIn(userId: string) {
  const result = await apiRequest("/api/auth/login", {
    method: "POST",
    body: { userId },
    schema: loginResponse,
  });

  return result.ok ? { ok: true as const, data: result.data.user } : result;
}

export function signOut() {
  return apiRequest("/api/auth/logout", { method: "POST", schema: okResponse });
}
