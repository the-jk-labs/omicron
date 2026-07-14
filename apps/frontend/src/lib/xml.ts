// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared escaping for the XML documents we serve from the app origin
// (sitemap.xml, the RSS feeds).

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
