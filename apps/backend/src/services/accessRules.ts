// SPDX-License-Identifier: AGPL-3.0-or-later
import { networkContains, normalizeNetwork, validateAddress } from "@/lib/ipNetwork.ts";

export type AccessRule = {
  id: string;
  network: string;
  action: "allow" | "block";
  reason: string;
  enabled: boolean;
  createdAt: string;
  expiresAt: string;
};

// Recovery, machine endpoints and their assets must remain reachable, even under a /0 block.
export const ACCESS_EXEMPT_PATHS = [
  "/api",
  "/api/*",
  "/oauth/authorize",
  "/oauth/token",
  "/oauth/revoke",
  "/.well-known/*",
  "/users/*",
  "/inbox",
  "/nodeinfo",
  "/nodeinfo/*",
  "/admin",
  "/admin/*",
  "/login",
  "/login/*",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/undo-email-change",
  "/_app/*",
  "/.within.website/*",
  "/robots.txt",
  "/sitemap.xml",
  "/sitemap/*",
  "*.xml",
  "*.rss",
  "*.atom",
  "/feed",
  "*/feed",
];

export function accessPath(input: string): string {
  if (!input.startsWith("/") || input.startsWith("//") || /[?#\\\s]/.test(input) || input.length > 2048) {
    throw new Error("Enter a path starting with /, without a query string or fragment.");
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    throw new Error("Enter a valid URL path.");
  }
  const segments: string[] = [];
  for (const segment of decoded.split("/")) {
    if (segment === "..") segments.pop();
    else if (segment && segment !== ".") segments.push(segment);
  }
  return (`/${segments.join("/")}` + (segments.length && decoded.endsWith("/") ? "/" : "")).toLowerCase();
}

function exemptPath(path: string): boolean {
  return (
    ACCESS_EXEMPT_PATHS.some((pattern) => {
      if (pattern.startsWith("*")) return path.endsWith(pattern.slice(1));
      if (pattern.endsWith("*")) return path.startsWith(pattern.slice(0, -1));
      return path === pattern;
    }) || /^\/indexnow-[0-9a-f]+\.txt$/.test(path)
  );
}

export function testAccessRules(rules: AccessRule[], ip: string, inputPath: string, now = Date.now()) {
  validateAddress(ip);
  const path = accessPath(inputPath);
  if (exemptPath(path))
    return {
      action: "exempt" as const,
      ruleId: null,
      message: "This path is protected from custom IP rules for compatibility or recovery.",
    };
  const rule = rules.find(
    (candidate) => candidate.enabled && Date.parse(candidate.expiresAt) > now && networkContains(candidate.network, ip),
  );
  if (!rule)
    return {
      action: "default" as const,
      ruleId: null,
      message: "No active custom rule matches. The normal Anubis policy applies when protection is on.",
    };
  return {
    action: rule.action,
    ruleId: rule.id,
    message:
      rule.action === "block"
        ? "This IP would receive HTTP 403 on this path."
        : "This IP would bypass the Anubis challenge. Authentication and rate limits still apply.",
  };
}

export const ACCESS_RULES_MARKER = "# managed-access-rules";

export function renderAccessRules(caddyfile: string, rules: AccessRule[]): string {
  if (!rules.some((rule) => rule.enabled)) return caddyfile;
  if (caddyfile.split(ACCESS_RULES_MARKER).length !== 2) {
    throw new Error(
      "Caddyfile must contain the managed access-rules marker exactly once. Update the deployed Caddyfile first.",
    );
  }
  const exemptions = ACCESS_EXEMPT_PATHS.map((path) => `'${path}'`).join(", ");
  const lines = [
    `@access_pages expression \`!(path(${exemptions}) || path_regexp('^/indexnow-[0-9a-fA-F]+[.]txt$'))\``,
    "route @access_pages {",
  ];
  for (const [i, rule] of rules.entries()) {
    if (!rule.enabled) continue;
    const network = normalizeNetwork(rule.network);
    const expiry = Date.parse(rule.expiresAt);
    if (!Number.isSafeInteger(expiry)) throw new Error("Invalid access rule expiry.");
    lines.push(`@access_${i} expression \`remote_ip('${network}') && int({time.now.unix_ms}) < ${expiry}\``);
    lines.push(
      rule.action === "block"
        ? `respond @access_${i} "Access blocked by an instance IP rule." 403`
        : `reverse_proxy @access_${i} http://frontend:3000`,
    );
  }
  lines.push("}");
  return caddyfile.replace(ACCESS_RULES_MARKER, () => lines.join("\n"));
}
