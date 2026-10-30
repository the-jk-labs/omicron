// SPDX-License-Identifier: AGPL-3.0-or-later
import type * as contract from "@omicron/contract";
import type * as z from "zod/mini";

// A body as a route builds it: the contract's type with a Date allowed wherever it has a string, since `c.json()`
// sends a Date as its ISO string.
type Body<T> = T extends string
  ? T | Date
  : T extends readonly (infer U)[]
    ? Body<U>[]
    : T extends object
      ? { [K in keyof T]: Body<T[K]> }
      : T;

type Schemas = {
  [K in keyof typeof contract as (typeof contract)[K] extends z.ZodMiniType ? K : never]: (typeof contract)[K];
};

/**
 * The response an endpoint promises, by its schema's name in packages/contract:
 * `return c.json({ items, nextCursor } satisfies Reply<"PostPage">)`. A body that drifts from the contract fails the
 * backend's own type check.
 */
export type Reply<Name extends keyof Schemas> = Body<z.output<Schemas[Name]>>;
