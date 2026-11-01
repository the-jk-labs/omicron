// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServer } from "node:http";
import type { InstanceInfo, Me } from "../../src/lib/types.ts";
import { post } from "../fixtures.ts";

// A loopback-only API for the real frontend; never connects to a database.
const instance: InstanceInfo = {
  name: "Omicron",
  domain: "",
  setupComplete: true,
  federationEnabled: false,
  emailEnabled: false,
  emailVerificationRequired: false,
  bannerText: null,
  bannerImageUrl: null,
  aboutHtml: null,
  rulesHtml: null,
  privacyPolicyHtml: null,
  contactEmail: null,
  contactUrl: null,
  abuseEmail: null,
  statusUrl: null,
  apiVersion: 1,
};
const user: Me = {
  id: "author-1",
  username: "ada",
  displayName: "Ada",
  bio: "",
  publicEmail: "",
  customSection: "",
  customSectionHtml: "",
  avatarUrl: null,
  isAdmin: false,
  isModerator: false,
  isPrivate: false,
  createdAt: "2026-01-01T12:00:00.000Z",
  updatedAt: "2026-01-01T12:00:00.000Z",
  tags: [],
  links: [],
  email: "ada@example.test",
  emailVerified: true,
  showAiAssistedPosts: true,
};
const article = post({
  language: "en",
  bannerUrl: "/api/uploads/chart.gif",
  contentHtml:
    '<h2>Reading accessibly</h2><p>A short article with an informative image and <a href="https://example.test">further reading</a>.</p><img src="/api/uploads/chart.gif" alt="Sales increased from 10 to 20" width="100" height="100"><p lang="fr">Bonjour</p>',
});
const draft = post({ status: "draft", contentHtml: "<p>Draft body</p>" });
const imported = post({
  id: "imported",
  status: "draft",
  contentHtml:
    '<figure><img src="/api/uploads/chart.gif" alt="Sales chart"><figcaption lang="fr">Sales graph</figcaption></figure>',
});
const emptyPage = { items: [], nextCursor: null };

createServer((request, response) => {
  const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const send = (body: unknown, status = 200) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (request.method === "POST" && path === "/api/uploads") {
    request.resume();
    return send({ url: "/api/uploads/chart.gif" });
  }
  if (request.method === "PATCH" && path.startsWith("/api/posts/")) {
    // Echo only identifiers; browser tests inspect writes without persisting anything.
    request.resume();
    return send({ post: { id: draft.id, slug: draft.slug } });
  }
  if (request.method !== "GET") return send({ error: "Unexpected fixture write" }, 501);
  if (path === "/api/instance") return send(instance);
  if (path === "/api/me") return send({ user: request.headers.cookie?.includes("a11y-user=1") ? user : null });
  if (path === "/api/seo") return send({ indexingEnabled: true, verification: {} });
  if (path === "/api/site") return send({ websiteId: null });
  if (path === "/api/auth/get-session") return send(null);
  if (path === "/api/notifications/unread-count") return send({ count: 0 });
  if (path === "/api/tags") return send({ tags: [] });
  if (path === "/api/posts/trending" || path === "/api/users/suggested") return send({ items: [] });
  if (path === "/api/posts" || path === "/api/feed") return send({ items: [article], nextCursor: null });
  if (path === "/api/posts/by/ada/hello-world") return send({ post: article });
  if (path === `/api/posts/${draft.id}`) return send({ post: draft });
  if (path === "/api/posts/imported") return send({ post: imported });
  if (path.endsWith("/comments")) return send(emptyPage);
  if (path.endsWith("/related")) return send({ items: [] });
  if (path === "/api/uploads/chart.gif") {
    response.writeHead(200, { "content-type": "image/gif" });
    return response.end(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
  }
  return send({ error: `Missing browser fixture: ${path}` }, 501);
}).listen(4174, "127.0.0.1");
