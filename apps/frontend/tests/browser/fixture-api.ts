// SPDX-License-Identifier: AGPL-3.0-or-later
import { createServer } from "node:http";
import type { InstanceInfo, Me } from "../../src/lib/types.ts";
import { post } from "../fixtures.ts";
import { targetTableHtml } from "../lib/editor/transfer-fixtures.ts";

// A loopback-only API for the real frontend; never connects to a database.
const instance: InstanceInfo = {
  name: "Omicron",
  domain: "",
  setupComplete: true,
  federationEnabled: false,
  emailEnabled: false,
  emailVerificationRequired: false,
  inviteOnly: false,
  bannerText: null,
  bannerImageUrl: null,
  logoUrl: null,
  faviconUrl: null,
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
const tableDraft = post({
  id: "table",
  status: "draft",
  contentHtml:
    '<table aria-labelledby="sales"><caption id="sales" lang="en">Sales table</caption><tr><th scope="col">Year</th></tr><tr><td>2026</td></tr></table>',
});
const imported = post({
  id: "imported",
  status: "draft",
  contentHtml:
    '<figure><img src="/api/uploads/chart.gif" alt="Sales chart"><figcaption lang="fr">Sales graph</figcaption></figure>',
});
const transferTableDraft = post({ id: "transfer-table", status: "draft", contentHtml: targetTableHtml });
const emptyPage = { items: [], nextCursor: null };

// Populated data for the route sweep, so its checks see real rows rather than empty states.
const TIME = "2026-01-01T12:00:00.000Z";
const adminUser: Me = { ...user, isAdmin: true };
const tag = { id: "tag-1", slug: "design", name: "Design" };
const actor = { id: "author-2", username: "bob", displayName: "Bob", avatarUrl: null, remote: false };
const list = {
  id: "list-1",
  title: "Reading list",
  description: "Articles worth keeping",
  visibility: "public",
  isReadLater: false,
  itemCount: 1,
  createdAt: TIME,
};
const member = {
  id: "author-2",
  username: "bob",
  displayName: "Bob",
  bio: "",
  publicEmail: "",
  customSection: "",
  avatarUrl: null,
  isAdmin: false,
  isModerator: false,
  email: "bob@example.test",
  emailVerified: false,
  suspended: false,
  createdAt: TIME,
};
const report = {
  id: "report-1",
  subjectType: "post",
  reason: "Spam",
  status: "open",
  resolution: "",
  createdAt: TIME,
  resolvedAt: null,
  reporter: { username: "bob", displayName: "Bob" },
  postId: article.id,
  postTitle: article.title,
  postAuthor: "ada",
  userId: "author-1",
  userUsername: "ada",
  userDisplayName: "Ada",
};
const totals = { views: 12, likes: 3, comments: 1, followers: 2 };
const fixtures: Record<string, unknown> = {
  "/api/users/ada": {
    user,
    counts: { followers: 2, following: 1, posts: 1 },
    followState: "none",
    isFollowing: false,
    isMuted: false,
    isBlocked: false,
    locked: false,
  },
  "/api/users/ada/posts": { items: [article], nextCursor: null },
  "/api/users/ada/recommendations": emptyPage,
  "/api/lists/user/ada": { lists: [list] },
  "/api/lists": { lists: [list] },
  "/api/lists/read-later": { list: { ...list, id: "read-later", title: "Read later", isReadLater: true } },
  "/api/lists/list-1": { list, isOwner: true, owner: { username: "ada", displayName: "Ada" } },
  "/api/lists/list-1/items": { items: [article], nextCursor: null },
  "/api/tags/design": { tag, postCount: 1, followerCount: 2, isFollowing: false },
  "/api/tags/design/posts": { items: [article], nextCursor: null },
  "/api/tags/following": { tags: [{ ...tag, postCount: 1 }] },
  "/api/search": { posts: [article], people: [actor], tags: [{ ...tag, postCount: 1 }] },
  "/api/notifications": {
    items: [
      {
        id: "n1",
        type: "like",
        actor,
        postId: article.id,
        postTitle: article.title,
        commentSnippet: null,
        read: false,
        createdAt: TIME,
      },
    ],
    nextCursor: null,
  },
  "/api/dashboard": {
    onInstanceViews: true,
    totals,
    period: { days: 30, ...totals },
    series: [{ date: "2026-01-01", ...totals }],
    posts: [],
  },
  "/api/posts/mine": { items: [draft], nextCursor: null },
  "/api/posts/mine/counts": { draft: 1, scheduled: 0, published: 1 },
  "/api/users/me/follow-requests": { items: [{ requestId: "r1", actor, createdAt: TIME }] },
  "/api/users/me/muted": { items: [actor] },
  "/api/users/me/blocked": { items: [] },
  "/api/webhooks/tokens": { tokens: [{ id: "t1", label: "Build hook", lastUsedAt: null, createdAt: TIME }] },
  // Having one keeps the passkey prompt from opening mid-test; the sweep opens it on purpose.
  "/api/auth/passkey/list-user-passkeys": [
    { id: "pk1", name: "Laptop", credentialID: "pk1", backedUp: true, deviceType: "multiDevice", createdAt: TIME },
  ],
  "/api/auth/list-sessions": [],
  "/api/admin/reports": { reports: [report], openCount: 1 },
  "/api/admin/users": { users: [member], nextCursor: null, total: 1, filteredTotal: 1 },
  "/api/admin/users/deleted": { users: [], nextCursor: null, total: 0, filteredTotal: 0 },
  "/api/admin/domains": { domains: [{ domain: "spam.example", reason: "Spam", createdAt: TIME }] },
  "/api/admin/email": {
    mode: "console",
    from: "",
    smtp: { port: 587, tls: true, hasPassword: false },
    relay: { provider: "resend", hasApiKey: false },
    dkim: { selector: "omicron", hasKey: false },
  },
  "/api/admin/security": { anubisProtection: false, anubisManaged: false },
  "/api/admin/security/access-rules": { rules: [] },
  "/api/admin/seo": { indexingEnabled: true, verification: {}, indexNowKey: null },
  "/api/admin/unsplash": { configured: false },
  "/api/admin/umami": { enabled: false, websiteId: "" },
  "/api/admin/settings": { onInstanceViews: true },
  "/api/admin/signups": {
    inviteOnly: true,
    invites: [
      { id: "i1", expiresAt: "2030-01-08T00:00:00.000Z", usedAt: null, usedByUsername: null, createdAt: TIME },
      { id: "i2", expiresAt: "2030-01-08T00:00:00.000Z", usedAt: TIME, usedByUsername: "bob", createdAt: TIME },
    ],
  },
  "/api/admin/instance": {
    appName: "Omicron",
    appDomain: "blog.example",
    federationEnabled: false,
    federationRunning: false,
    sessionSecretManaged: false,
    bannerText: null,
    bannerImageUrl: null,
    logoUrl: null,
    faviconUrl: null,
    about: "",
    rules: "",
    privacyPolicy: "",
    contactEmail: "",
    contactUrl: "",
    abuseEmail: "",
    statusUrl: "",
  },
  "/api/admin/tags/aliases": { aliases: [] },
  "/api/photos/providers": { providers: [] },
  "/api/oauth/connections": { connections: [] },
  "/api/oauth/authorize": {
    ticket: "fixture-ticket",
    name: "Fixture application",
    callbackOrigin: "https://client.example",
    username: "ada",
    scope: "read:accounts webhooks:posts",
    renewable: true,
    permissions: [
      { scope: "read:accounts", description: "Verify your public identity only." },
      { scope: "webhooks:posts", description: "Be notified when your public posts change." },
    ],
  },
  "/api/oauth/apps": {
    apps: [
      {
        id: "fixture-client-id",
        name: "Fixture application",
        website: null,
        redirectUris: ["https://app.example/oauth/callback"],
        scopes: ["read:accounts", "webhooks:posts"],
        publicClient: false,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    availableScopes: [
      { scope: "read:accounts", description: "Verify your public identity only." },
      { scope: "webhooks:posts", description: "Be notified when your public posts change." },
    ],
  },
};

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
  if (request.method === "POST" && path === "/api/notifications/read") return send({ ok: true });
  if (path === "/api/auth/passkey/generate-authenticate-options") {
    // Conditional sign-in asks on load; a browser with no passkey simply never answers.
    request.resume();
    return send({ challenge: "AAAA", rpId: "127.0.0.1", allowCredentials: [], userVerification: "preferred" });
  }
  if (request.method === "POST" && path === "/api/oauth/authorize") {
    request.resume();
    // The real backend refuses a decision unless it comes from this origin.
    if (request.headers.origin !== "http://127.0.0.1:4173")
      return send({ error: "A same-origin request is required." }, 403);
    return send({ redirect: "https://client.example/callback?code=fixture-code&state=s" });
  }
  if (request.method !== "GET") return send({ error: "Unexpected fixture write" }, 501);
  const cookie = request.headers.cookie ?? "";
  if (path === "/api/instance")
    return send({
      ...instance,
      inviteOnly: cookie.includes("a11y-invite-only=1"),
      ...(cookie.includes("a11y-branded=1") && {
        logoUrl: "/api/uploads/chart.gif",
        faviconUrl: "/api/uploads/chart.gif",
      }),
    });
  if (path === "/api/me") {
    if (cookie.includes("a11y-admin=1")) return send({ user: adminUser });
    return send({ user: cookie.includes("a11y-user=1") ? user : null });
  }
  if (path in fixtures) return send(fixtures[path]);
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
  if (path === "/api/posts/table") return send({ post: tableDraft });
  if (path === "/api/posts/transfer-table") return send({ post: transferTableDraft });
  if (path.endsWith("/comments")) return send(emptyPage);
  if (path.endsWith("/related")) return send({ items: [] });
  if (path === "/api/uploads/chart.gif") {
    response.writeHead(200, { "content-type": "image/gif" });
    return response.end(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
  }
  return send({ error: `Missing browser fixture: ${path}` }, 501);
}).listen(4174, "127.0.0.1");
