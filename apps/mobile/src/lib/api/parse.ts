import * as z from "zod/mini";

/** A response that doesn't match the contract: the instance speaks a version of the API this app can't read. */
export class ContractError extends Error {
  constructor(
    /** The endpoint, for the log. */
    public path: string,
    public issues: readonly z.core.$ZodIssue[],
  ) {
    super("This instance runs a version of Omicron this app can't read yet. Update the app and try again.");
    this.name = "ContractError";
  }
}

// Enough rounds to drop a whole page of bad items one array level at a time; past it, something structural is wrong.
const MAX_ROUNDS = 8;

type Container = Record<PropertyKey, unknown> | unknown[];
const isContainer = (value: unknown): value is Container => typeof value === "object" && value !== null;

/** Where the element an issue sits in starts: the path up to its deepest array index, and that index. */
function elementOf(path: readonly PropertyKey[]): { at: readonly PropertyKey[]; index: number } | null {
  for (let i = path.length - 1; i >= 0; i--) {
    const segment = path[i];
    if (typeof segment === "number") return { at: path.slice(0, i), index: segment };
  }
  return null;
}

function arrayAt(root: unknown, at: readonly PropertyKey[]): unknown[] | null {
  let node = root;
  for (const key of at) {
    if (!isContainer(node)) return null;
    node = Array.isArray(node) ? node[Number(key)] : node[key];
  }
  return Array.isArray(node) ? node : null;
}

/**
 * Reads a response with its contract schema. Fields the schema doesn't name are kept and ignored. A list element
 * that doesn't fit (one bad post in a feed, one reply in a thread) is left out, and the rest still shows. Anything else
 * that doesn't fit throws a `ContractError` rather than handing the screens data they would crash on.
 */
export function parseResponse<S extends z.ZodMiniType>(schema: S, data: unknown, path: string): z.input<S> {
  // `validate` is the compiled check without building a result: the fast path every good response takes.
  if (z.validate(schema, data)) return data;
  // A copy to drop items from; `data` came from JSON, so a JSON round-trip copies it whole (Hermes has no structuredClone).
  const current: unknown = JSON.parse(JSON.stringify(data));
  let dropped = 0;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Only a failure pays for `safeParse`, for the issues that say what to leave out.
    const result = z.safeParse(schema, current);
    const issues = result.success ? [] : result.error.issues;
    const targets = new Map<unknown[], Set<number>>();
    for (const issue of issues) {
      const element = elementOf(issue.path);
      const array = element && arrayAt(current, element.at);
      if (!element || !array) throw new ContractError(path, issues);
      targets.set(array, (targets.get(array) ?? new Set()).add(element.index));
    }
    if (targets.size === 0) throw new ContractError(path, issues);
    // From the back of each array, so earlier indexes stay put.
    for (const [array, indexes] of targets) {
      for (const index of [...indexes].sort((a, b) => b - a)) array.splice(index, 1);
      dropped += indexes.size;
    }
    if (z.validate(schema, current)) {
      console.warn(`${path}: left out ${dropped} item(s) that don't match the API contract`);
      return current;
    }
  }
  throw new ContractError(path, []);
}
