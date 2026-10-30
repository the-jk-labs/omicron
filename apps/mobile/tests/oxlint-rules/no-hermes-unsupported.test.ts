import { RuleTester } from "oxlint/plugins-dev";
import { describe, it } from "vitest";
import plugin from "../../oxlint-rules/index.mjs";

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { sourceType: "module", parserOptions: { lang: "ts" } } });

tester.run("no-hermes-unsupported", plugin.rules["no-hermes-unsupported"], {
  valid: [
    "[...items].sort((a, b) => a - b);",
    "items.toReversed(); items.toSpliced(0, 1); items.with(0, 1); items.findLast(Boolean);",
    "Promise.allSettled([]); Promise.any([]); Promise.withResolvers(); Object.entries({}); Array.from([]);",
    "Object.groupBy(items, (i) => i.type); Map.groupBy(items, (i) => i.type);",
    "const Array = { fromAsync: () => 1 }; Array.fromAsync();",
    "function clone(structuredClone: (v: unknown) => unknown) { return structuredClone(1); }",
    'if (typeof structuredClone === "function") {}',
    "let registry: FinalizationRegistry<string> | undefined;",
    "const options = { structuredClone: true, Temporal: 1 }; options.structuredClone;",
    "const toSorted = 1; const obj = { toSorted };",
    "class Items { #toSorted() {} run() { this.#toSorted(); } }",
  ],
  invalid: [
    { code: "items.toSorted();", errors: [{ message: /`\.toSorted\(\)`.*\[\.\.\.items\]\.sort/ }] },
    { code: 'items["toSorted"]((a, b) => a - b);', errors: [{ messageId: "method" }] },
    { code: "const sort = items.toSorted;", errors: [{ messageId: "method" }] },
    { code: "await Array.fromAsync(stream);", errors: [{ message: /`Array\.fromAsync`/ }] },
    { code: "const copy = structuredClone(data);", errors: [{ message: /`structuredClone`/ }] },
    { code: 'throw new AggregateError([], "failed");', errors: [{ messageId: "static" }] },
    { code: "const now = Temporal.Now.instant();", errors: [{ messageId: "static" }] },
    {
      name: "builtins declared by the lint env are still caught",
      code: "await Array.fromAsync(stream); structuredClone(data);",
      languageOptions: { globals: { Array: "readonly", structuredClone: "readonly" } },
      errors: [{ message: /`Array\.fromAsync`/ }, { message: /`structuredClone`/ }],
    },
  ],
});
