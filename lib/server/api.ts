import type { ZodType } from "zod";

/** A failure with a stable machine-readable code and an HTTP status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
};

const MAX_BODY_BYTES = 100_000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

function getRequestId(request: Request) {
  const supplied = request.headers.get("x-request-id");

  return supplied && REQUEST_ID_PATTERN.test(supplied)
    ? supplied
    : crypto.randomUUID();
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

type RouteContext<P> = { requestId: string; params: P };

/**
 * Wraps a route handler with request IDs, structured errors and logging.
 * Unexpected errors are logged with the request ID and returned as a generic
 * 500, so internals never leak to the client.
 */
export function withApi<P = Record<string, string>>(
  handler: (request: Request, context: RouteContext<P>) => Promise<Response>,
) {
  return async (
    request: Request,
    routeContext: { params: Promise<P> },
  ): Promise<Response> => {
    const requestId = getRequestId(request);

    try {
      const params = await routeContext.params;
      const response = await handler(request, { requestId, params });
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (error) {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError(500, "internal_error", "Something went wrong.");

      if (!(error instanceof ApiError)) {
        console.error("unhandled api error", { requestId, error });
      }

      const body: ApiErrorBody = {
        error: {
          code: apiError.code,
          message: apiError.message,
          requestId,
          ...(apiError.details === undefined
            ? {}
            : { details: apiError.details }),
        },
      };

      return Response.json(body, {
        status: apiError.status,
        headers: { "x-request-id": requestId, ...apiError.headers },
      });
    }
  };
}

/** Reads and validates a JSON body, with a size cap and field-level errors. */
export async function parseBody<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  const text = await request.text();

  if (text.length > MAX_BODY_BYTES) {
    throw new ApiError(413, "payload_too_large", "Request body is too large.");
  }

  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const result = schema.safeParse(raw);

  if (!result.success) {
    throw new ApiError(
      400,
      "validation_failed",
      "Request body did not pass validation.",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    );
  }

  return result.data;
}
