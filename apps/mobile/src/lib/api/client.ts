import * as z from "zod/mini";
import { appFetch } from "@/lib/user-agent";
import { parseResponse } from "./parse";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The request field the error is about, when the backend names one. */
    public field?: string,
    /** Seconds to wait before retrying, from a 429's Retry-After. */
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** The request never got an HTTP answer: no connection, DNS, TLS, timeout. Native fetch raises these as
 * platform exceptions; they are normalised here so callers see one error type. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("Couldn't reach the server. Check your connection.", { cause });
    this.name = "NetworkError";
  }
}

const errorBodySchema = z.object({ error: z.string(), field: z.optional(z.string()) });

// A gateway saying the backend behind it isn't answering, as opposed to the backend reporting an error.
const GATEWAY_ERRORS = new Set([502, 503, 504]);

export type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export type ApiClientOptions = {
  origin: string;
  /** The Better Auth session cookie for this instance, or "" when signed out. */
  getCookie: () => string | Promise<string>;
  fetch?: Fetcher;
  /** Called when the instance didn't answer (transport failure or gateway error), to check for an outage. */
  onUnreachable?: () => void;
};

const readRetryAfter = (res: Response) => {
  const seconds = Number(res.headers.get("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
};

const json = (body: unknown) => (body === undefined ? undefined : JSON.stringify(body));

export function createApiClient({ origin, getCookie, fetch = appFetch, onUnreachable }: ApiClientOptions) {
  async function request<S extends z.ZodMiniType>(
    schema: S,
    method: string,
    path: string,
    body?: BodyInit,
    contentType?: string,
  ): Promise<z.input<S>> {
    const cookie = await getCookie();
    const headers: Record<string, string> = {
      accept: "application/json",
      // Cookie-authenticated writes must come from the instance's origin (the backend's CSRF rule).
      origin,
    };
    if (body !== undefined) headers["content-type"] = contentType ?? "application/json";
    if (cookie) headers.cookie = cookie;

    // `omit`: the cookie is set by hand above, and a native cookie jar must never mix instances.
    let res: Response;
    let text: string;
    try {
      res = await fetch(`${origin}/api${path}`, { method, headers, body, credentials: "omit" });
      text = await res.text();
    } catch (error) {
      onUnreachable?.();
      throw new NetworkError(error);
    }
    if (GATEWAY_ERRORS.has(res.status)) onUnreachable?.();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // A reverse proxy's HTML error page still fails as an ApiError carrying its status.
      if (res.ok) throw new ApiError(res.status, "Unexpected response from the server.");
    }
    if (!res.ok) {
      const parsed = errorBodySchema.safeParse(data);
      throw new ApiError(
        res.status,
        parsed.success ? parsed.data.error : `Request failed (${res.status})`,
        parsed.success && parsed.data.field ? parsed.data.field : undefined,
        res.status === 429 ? readRetryAfter(res) : undefined,
      );
    }
    return parseResponse(schema, data, path);
  }

  return {
    origin,
    // Each call names the contract schema of what it gets back (packages/contract); the response is parsed with it.
    get: <S extends z.ZodMiniType>(path: string, schema: S) => request(schema, "GET", path),
    post: <S extends z.ZodMiniType>(path: string, schema: S, body?: unknown) =>
      request(schema, "POST", path, json(body)),
    patch: <S extends z.ZodMiniType>(path: string, schema: S, body?: unknown) =>
      request(schema, "PATCH", path, json(body)),
    put: <S extends z.ZodMiniType>(path: string, schema: S, body?: unknown) => request(schema, "PUT", path, json(body)),
    del: <S extends z.ZodMiniType>(path: string, schema: S, body?: unknown) =>
      request(schema, "DELETE", path, json(body)),
    /** Raw binary upload: the backend takes image bytes with their MIME type, not multipart. */
    postRaw: <S extends z.ZodMiniType>(path: string, schema: S, body: BodyInit, contentType: string) =>
      request(schema, "POST", path, body, contentType),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
