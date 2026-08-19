// SPDX-License-Identifier: AGPL-3.0-or-later
// Minimal declarations for the Deno globals the backend source touches.
//
// `src/lib/types.ts` derives the API payload types from the backend's own
// serializers (see the `@` alias in svelte.config.js). TypeScript typechecks
// every module in that import graph, and a few of them — config.ts most of all —
// read `Deno.env` at module scope. This app runs on Node and has no Deno types,
// so without these declarations the frontend typecheck fails on backend source
// it only ever reads types from.
//
// Deliberately narrow: it covers exactly the surface the imported graph uses,
// not the whole Deno API. If a future backend change pulls in more, add it here
// — the typecheck will say which. Nothing here reaches the bundle; the backend
// is only ever imported with `import type`, which is erased at build time.
declare namespace Deno {
  export const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    has(key: string): boolean;
    toObject(): Record<string, string>;
  };
  export function exit(code?: number): never;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): void;
  export function readTextFileSync(path: string): string;
  export function writeTextFileSync(path: string, data: string, options?: { mode?: number }): void;
}

// The backend imports hono through the `jsr:` import map in deno.json, which
// this app's Node-style resolver cannot follow. It surfaces here because
// `routes/serializers.ts` imports `lib/cover.ts`, which imports `lib/http.ts`,
// whose only use of hono is `import type { Context }` in signatures nothing on
// this side ever reads. A shorthand ambient declaration (no body — every import
// from it is `any`) is therefore enough to let that module typecheck, and keeps
// the real hono types out of this app entirely. This app does not use hono
// itself, so nothing else is affected.
declare module "hono" {
  // Only ever appears as a parameter annotation inside backend modules; no
  // type information from it is read on this side. Structural-any keeps the
  // members those modules call (`c.json`, `c.req`) resolvable.
  // oxlint-disable-next-line no-explicit-any
  export type Context = Record<string, any>;
}

// Reached the same way, via `lib/http.ts`, which maps Hono's own client-error
// exception onto this app's `{ error }` response shape. Only `status` and
// `message` are touched there.
declare module "hono/http-exception" {
  export class HTTPException extends Error {
    readonly status: number;
  }
}
