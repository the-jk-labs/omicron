// SPDX-License-Identifier: AGPL-3.0-or-later
// Thin client over the same-origin /api proxy. Works in the browser (global
// fetch) and in SSR load functions (pass the provided `fetch`).

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type FetchFn = typeof globalThis.fetch;

async function request<T>(
  path: string,
  init: RequestInit,
  fetchFn: FetchFn,
): Promise<T> {
  const res = await fetchFn(`/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export function makeApi(fetchFn: FetchFn = globalThis.fetch) {
  return {
    get: <T>(path: string) => request<T>(path, { method: "GET" }, fetchFn),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }, fetchFn),
    patch: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }, fetchFn),
    del: <T>(path: string) => request<T>(path, { method: "DELETE" }, fetchFn),
    // Raw binary POST (e.g. file uploads). The given content-type overrides the
    // default JSON header and the body is sent as-is.
    postRaw: <T>(path: string, body: BodyInit, contentType: string) =>
      request<T>(path, { method: "POST", body, headers: { "content-type": contentType } }, fetchFn),
  };
}

// Default client for browser-side calls.
export const api = makeApi();