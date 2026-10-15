import { jwtVerify, SignJWT } from "jose";
import { eq } from "drizzle-orm";
import type { Principal, Role } from "@/features/action-plans/domain/permissions";
import { ApiError } from "./api";
import { schema, type Database } from "./db";
import { getEnv } from "./env";

/**
 * Demo sign-in sessions.
 *
 * A session is a signed, HttpOnly cookie that carries only a user id. The
 * user (and therefore the role) is re-read from the database on every
 * request, so changing a role or removing a user takes effect immediately.
 *
 * There are no passwords: sign-in picks one of the seeded fictional personas.
 * `getSessionPrincipal` is the single seam to replace with a real identity
 * provider (Supabase Auth, OIDC) without touching authorization.
 */

const COOKIE_NAME = "sustainops_session";
const MAX_AGE_SECONDS = 60 * 60 * 8;
const ISSUER = "sustainops";

function getKey() {
  const { SESSION_SECRET } = getEnv();

  if (!SESSION_SECRET) {
    throw new ApiError(
      503,
      "auth_not_configured",
      "Sign-in is not configured. Set SESSION_SECRET (at least 32 characters).",
    );
  }

  return new TextEncoder().encode(SESSION_SECRET);
}

function cookieAttributes(maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";

  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/** The Set-Cookie header value that signs a user in. */
export async function createSessionCookie(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(getKey());

  return `${COOKIE_NAME}=${token}; ${cookieAttributes(MAX_AGE_SECONDS)}`;
}

export function clearSessionCookie() {
  return `${COOKIE_NAME}=; ${cookieAttributes(0)}`;
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie");

  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");

    if (key === name) {
      return value.join("=");
    }
  }

  return null;
}

export function toPrincipal(row: typeof schema.users.$inferSelect): Principal {
  return {
    id: row.id,
    name: row.name,
    role: row.role as Role,
    department: row.department,
  };
}

/** The signed-in user for this request, or null. */
export async function getSessionPrincipal(
  request: Request,
  db: Database,
): Promise<Principal | null> {
  const token = readCookie(request, COOKIE_NAME);

  if (!token) {
    return null;
  }

  let userId: string | undefined;

  try {
    const { payload } = await jwtVerify(token, getKey(), { issuer: ISSUER });
    userId = payload.sub;
  } catch {
    return null;
  }

  if (!userId) {
    return null;
  }

  const [row] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  return row ? toPrincipal(row) : null;
}

/** Like getSessionPrincipal, but answers 401 when nobody is signed in. */
export async function requirePrincipal(
  request: Request,
  db: Database,
): Promise<Principal> {
  const principal = await getSessionPrincipal(request, db);

  if (!principal) {
    throw new ApiError(401, "unauthenticated", "Sign in to continue.");
  }

  return principal;
}
