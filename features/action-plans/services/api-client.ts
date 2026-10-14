import type { ZodType } from "zod";
import { apiErrorSchema } from "@/lib/schemas/action-plan";

export type ApiFailure = {
  ok: false;
  code: string;
  message: string;
  requestId?: string;
};

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

const NETWORK_FAILURE: ApiFailure = {
  ok: false,
  code: "network_error",
  message:
    "The request failed. Check your connection and try again.",
};

/** Calls the JSON API and validates the response against a schema. */
export async function apiRequest<T>(
  path: string,
  {
    method = "GET",
    body,
    schema,
  }: { method?: string; body?: unknown; schema: ZodType<T> },
): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return NETWORK_FAILURE;
  }

  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const parsedError = apiErrorSchema.safeParse(payload);

    return parsedError.success
      ? { ok: false, ...parsedError.data.error }
      : {
          ok: false,
          code: "request_failed",
          message: "The request could not be completed. Please try again.",
        };
  }

  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    return {
      ok: false,
      code: "unexpected_response",
      message: "The server response was not in the expected format.",
    };
  }

  return { ok: true, data: parsed.data };
}
