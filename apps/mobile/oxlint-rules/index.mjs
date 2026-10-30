/**
 * Local oxlint JS plugin — the project's custom lint rules.
 * Loaded via `jsPlugins` in oxlint.config.ts; rules are referenced as `local/*`.
 */

/**
 * Enforce static + named @react-native-vector-icons imports.
 * ✗  import Ionicons from "@react-native-vector-icons/ionicons"
 * ✗  import Ionicons from "@react-native-vector-icons/ionicons/static"  (default import)
 * ✓  import { Ionicons } from "@react-native-vector-icons/ionicons/static"
 */
const SCOPE = "@react-native-vector-icons/";
const enforceStaticVectorIcons = {
  meta: {
    type: "suggestion",
    fixable: "code",
    docs: {
      description:
        "Enforce static @react-native-vector-icons imports (e.g. .../material-icons/static) using named imports instead of default imports",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source.value;

        // Only touch imports from this scope.
        if (typeof source !== "string" || !source.startsWith(SCOPE)) return;

        // 1. Enforce the /static path suffix.
        if (!source.endsWith("/static")) {
          const suggested = `${source}/static`;
          context.report({
            node: node.source,
            message: `Use the static import "${suggested}" instead of "${source}" to embed the font at build time.`,
            fix(fixer) {
              const quote = node.source.raw ? node.source.raw[0] : '"';
              return fixer.replaceText(node.source, `${quote}${suggested}${quote}`);
            },
          });
        }

        // 2. Enforce named imports instead of default imports.
        const defaultSpecifier = node.specifiers.find((specifier) => specifier.type === "ImportDefaultSpecifier");
        if (defaultSpecifier) {
          const name = defaultSpecifier.local.name;
          context.report({
            node: defaultSpecifier,
            message: `Use a named import (e.g. import { ${name} } from "${source}") instead of a default import for @react-native-vector-icons.`,
            // Convert `import Name from "..."` → `import { Name } from "..."`.
            fix(fixer) {
              return fixer.replaceText(defaultSpecifier, `{ ${name} }`);
            },
          });
        }
      },
    };
  },
};

/**
 * Disallow ES builtins missing from the app's Hermes runtime (they crash at runtime with "is not a function").
 * tests/oxlint-rules/hermes-unsupported-builtins.test.ts checks each entry against the Hermes source RN ships,
 * and fails once Hermes gains support, so the entry can be removed.
 * ✗  lessons.toSorted(compare)
 * ✓  [...lessons].sort(compare)
 */
export const UNSUPPORTED_METHODS = {
  toSorted: "copy then sort, e.g. [...items].sort(compare)",
};
export const UNSUPPORTED_STATICS = {
  Array: { fromAsync: "collect with a for await...of loop" },
};
export const UNSUPPORTED_GLOBALS = {
  structuredClone: "copy the value explicitly (spread or JSON round-trip)",
  AggregateError: "throw a regular Error",
  Temporal: "use Date or date-fns",
};
const TYPE_ONLY_PARENTS = new Set(["TSTypeReference", "TSQualifiedName", "TSTypeQuery"]);

function propertyName(node) {
  if (!node.computed) return node.property.type === "Identifier" ? node.property.name : null;
  return node.property.type === "Literal" && typeof node.property.value === "string" ? node.property.value : null;
}

/** @typedef {Parameters<import("oxlint/plugins-dev").RuleTester["run"]>[1]} Rule */

/** @type {Rule} */
const noHermesUnsupported = {
  meta: {
    type: "problem",
    docs: { description: "Disallow ES builtins that the Hermes runtime does not implement" },
    messages: {
      method: "Hermes has no `.{{name}}()`, it crashes at runtime. Instead, {{hint}}.",
      static: "Hermes has no `{{name}}`, it crashes at runtime. Instead, {{hint}}.",
    },
  },
  create(context) {
    const reportGlobal = (node) => {
      const { parent } = node;
      // Types and `typeof` feature checks never touch the runtime value.
      if (TYPE_ONLY_PARENTS.has(parent.type)) return;
      if (parent.type === "UnaryExpression" && parent.operator === "typeof") return;

      if (Object.hasOwn(UNSUPPORTED_GLOBALS, node.name)) {
        context.report({ node, messageId: "static", data: { name: node.name, hint: UNSUPPORTED_GLOBALS[node.name] } });
        return;
      }

      if (!Object.hasOwn(UNSUPPORTED_STATICS, node.name)) return;
      if (parent.type !== "MemberExpression" || parent.object !== node) return;
      const statics = UNSUPPORTED_STATICS[node.name];
      const name = propertyName(parent);
      if (name === null || !Object.hasOwn(statics, name)) return;

      context.report({
        node: parent,
        messageId: "static",
        data: { name: `${node.name}.${name}`, hint: statics[name] },
      });
    };

    return {
      MemberExpression(node) {
        const name = propertyName(node);
        if (name === null || !Object.hasOwn(UNSUPPORTED_METHODS, name)) return;
        context.report({ node: node.property, messageId: "method", data: { name, hint: UNSUPPORTED_METHODS[name] } });
      },
      // Unresolved references (plus env-declared globals) are the builtins; locally declared names are skipped.
      "Program:exit"(program) {
        const globalScope = context.sourceCode.getScope(program);
        const references = [...globalScope.through];
        for (const variable of globalScope.variables) {
          if (variable.defs.length === 0) references.push(...variable.references);
        }
        for (const reference of references) reportGlobal(reference.identifier);
      },
    };
  },
};

export default {
  meta: { name: "local" },
  rules: {
    "enforce-static-vector-icons": enforceStaticVectorIcons,
    "no-hermes-unsupported": noHermesUnsupported,
  },
};
