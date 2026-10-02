// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared escaping for the XML documents we serve from the app origin
// (sitemap.xml, the RSS feeds).

// XML 1.0 forbids these even escaped (C0 controls but tab/LF/CR, U+FFFE/U+FFFF,
// lone surrogates); one in a federated title would make the whole feed unparseable.
const XML_INVALID =
  // oxlint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function escapeXml(value: string): string {
  return value
    .replace(XML_INVALID, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
