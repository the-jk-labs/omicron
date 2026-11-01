// SPDX-License-Identifier: AGPL-3.0-or-later
// Requires a throwaway Postgres role with CREATEDB; every peer DB name is generated.
import { randomUUID } from "node:crypto";
import { PostResponse, SavedPostResponse, UploadedImage } from "@omicron/contract";
import { load } from "cheerio";
import { afterAll, beforeAll, expect, test } from "vitest";
import { accessibilityContent, expectAccessibleContent } from "../accessibilityContent.ts";
import { type Instance, Instances } from "./federation/instances.ts";
import type { InstanceState } from "./federation/protocol.ts";

const instances = new Instances();
let sender: Instance;
let receiver: Instance;
const png = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==",
    "base64",
  ),
);

beforeAll(async () => {
  [sender, receiver] = await Promise.all([instances.start(), instances.start()]);
  await sender.control("follower", { actor: `${receiver.origin}/users/writer` });
  await receiver.control("follower", { actor: `${sender.origin}/users/writer` });
}, 60_000);
afterAll(() => instances.close(), 30_000);

function json(instance: Instance, path: string, body: unknown, method = "POST") {
  return instance.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function create(instance: Instance, title: string) {
  const urls: string[] = [];
  for (let i = 0; i < 2; i++) {
    const res = await instance.request("/api/uploads", {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: new Uint8Array(png),
    });
    expect(res.status).toBe(201);
    urls.push(UploadedImage.parse(await res.json()).url);
  }
  const html = accessibilityContent
    .replace("/api/uploads/chart.png", urls[0])
    .replace("/api/uploads/decoration.png", urls[1]);
  const response = await json(instance, "/api/posts", {
    title,
    contentHtml: html,
    language: "en",
    tags: ["accessibility"],
    status: "published",
  });
  expect(response.status).toBe(201);
  const { post } = SavedPostResponse.parse(await response.json());
  return { post, html, graph: urls[0], decorative: urls[1], apId: `${instance.origin}/posts/${post.id}` };
}

async function received(instance: Instance, apId: string, title: string) {
  let row: InstanceState["posts"][number] | undefined;
  await expect
    .poll(
      async () => {
        row = (await instance.state()).posts.find((post) => post.apId === apId);
        return row?.title;
      },
      { timeout: 10_000, interval: 50 },
    )
    .toBe(title);
  return row!;
}

async function expectReadable(
  source: Instance,
  destination: Instance,
  local: Awaited<ReturnType<typeof create>>,
  title: string,
) {
  const row = await received(destination, local.apId, title);
  const response = await destination.request(`/api/posts/${row.id}`, {}, false);
  expect(response.status).toBe(200);
  const post = PostResponse.parse(await response.json()).post;
  expect(post).toMatchObject({ remote: true, language: "en" });
  expectAccessibleContent(post.contentHtml, `${source.origin}${local.graph}`);
  const $ = load(post.contentHtml, {}, false);
  expect($('img[alt=""]').attr("src")).toBe(`${source.origin}${local.decorative}`);
  expect($("a").attr("href")).toBe(`${source.origin}/@writer/${local.post.slug}#omicron-content-graph-description`);
  expect(post.contentHtml).toBe(row.contentHtml);
  for (const url of [local.graph, local.decorative]) {
    const image = await source.request(url, {}, false);
    expect(image.status).toBe(200);
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(png);
  }
  return post;
}

function activity(source: Instance, title: string, publiclyAddressed = true) {
  const id = `${source.origin}/posts/${randomUUID()}`;
  const audience = publiclyAddressed
    ? "https://www.w3.org/ns/activitystreams#Public"
    : `${source.origin}/users/writer/followers`;
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${id}/activity`,
    type: "Create",
    actor: `${source.origin}/users/writer`,
    to: [audience],
    object: {
      id,
      type: "Article",
      attributedTo: `${source.origin}/users/writer`,
      name: title,
      content: accessibilityContent.replaceAll("/api/uploads/", `${source.origin}/api/uploads/`),
      to: [audience],
    },
  };
}

test("signed Create and Update preserve accessibility metadata through the receiving database and reader API", async () => {
  const local = await create(sender, "Signed report");
  const first = await expectReadable(sender, receiver, local, "Signed report");
  const edited = `${local.html}<p lang="ar" dir="rtl">A reviewed passage.</p>`;
  const update = await json(
    sender,
    `/api/posts/${local.post.id}`,
    { title: "Reviewed signed report", contentHtml: edited },
    "PATCH",
  );
  expect(update.status).toBe(200);
  local.post = SavedPostResponse.parse(await update.json()).post;
  const current = await expectReadable(sender, receiver, local, "Reviewed signed report");
  expect(current.id).toBe(first.id);
  expect(load(current.contentHtml)('p[lang="ar"]').attr("dir")).toBe("rtl");
  expect((await sender.state()).posts.find((post) => post.id === local.post.id)?.contentHtml).toBe(edited);
  const state = await receiver.state();
  for (const type of ["Create", "Update"]) {
    const request = state.inbox.find((entry) => {
      const body = JSON.parse(entry.body);
      return body.type === type && body.object?.id === local.apId;
    });
    expect(request?.status).toBeGreaterThanOrEqual(200);
    expect(request?.status).toBeLessThan(300);
    expect(request?.headers.signature).toBeTruthy();
  }
  expect((await sender.state()).actorFetches).toBeGreaterThan(0);
});

test("the reverse direction uses independent actor keys, database storage and publisher URL context", async () => {
  const local = await create(receiver, "Reverse signed report");
  await expectReadable(receiver, sender, local, "Reverse signed report");
  expect(sender.origin).not.toBe(receiver.origin);
  const keys = await Promise.all(
    [sender, receiver].map(async (instance) => {
      const response = await instance.request(
        "/users/writer",
        { headers: { accept: "application/activity+json" } },
        false,
      );
      expect(response.status).toBe(200);
      return (await response.json()).publicKey.publicKeyPem as string;
    }),
  );
  expect(keys[0]).toContain("BEGIN PUBLIC KEY");
  expect(keys[1]).toContain("BEGIN PUBLIC KEY");
  expect(keys[0]).not.toBe(keys[1]);
});

test("re-delivery of the signed Create does not duplicate or damage the receiving copy", async () => {
  const local = await create(sender, "Retried signed report");
  const first = await expectReadable(sender, receiver, local, "Retried signed report");
  await sender.control("deliver", { postId: local.post.id, action: "create" });
  await expect
    .poll(
      async () =>
        (await receiver.state()).inbox.filter((entry) => JSON.parse(entry.body).id === `${local.apId}/activity`).length,
      { timeout: 10_000 },
    )
    .toBe(2);
  const state = await receiver.state();
  expect(state.posts.filter((post) => post.apId === local.apId)).toHaveLength(1);
  expect((await expectReadable(sender, receiver, local, "Retried signed report")).contentHtml).toBe(first.contentHtml);
});

test("an unsigned activity cannot insert a metadata-rich remote post", async () => {
  const body = activity(sender, "Unsigned report");
  const response = await receiver.request(
    "/inbox",
    { method: "POST", headers: { "content-type": "application/activity+json" }, body: JSON.stringify(body) },
    false,
  );
  expect(response.status).toBe(401);
  expect((await receiver.state()).posts.some((post) => post.apId === body.object.id)).toBe(false);
});

test("a valid signature from another actor cannot authorize the claimed writer's content", async () => {
  const forged = activity(sender, "Wrong signer report");
  const result = await sender.control("sign", {
    target: `${receiver.origin}/inbox`,
    activity: forged,
    signer: "intruder",
  });
  expect(result.status).toBe(401);
  expect((await receiver.state()).posts.some((post) => post.apId === forged.object.id)).toBe(false);
});

test("changing a real signed delivery body invalidates its digest and cannot insert or overwrite metadata", async () => {
  const local = await create(sender, "Integrity report");
  const original = await expectReadable(sender, receiver, local, "Integrity report");
  const recorded = (await receiver.state()).inbox.find(
    (entry) => JSON.parse(entry.body).id === `${local.apId}/activity`,
  )!;
  const changed = JSON.parse(recorded.body);
  changed.id = `${sender.origin}/tampered/${randomUUID()}`;
  changed.object.content = "<p>Tampered description</p>";
  const headers = new Headers(recorded.headers);
  for (const header of ["content-length", "connection", "host", "transfer-encoding"]) headers.delete(header);
  const response = await receiver.request(
    recorded.path,
    { method: "POST", headers, body: JSON.stringify(changed) },
    false,
  );
  expect(response.status).toBe(401);
  expect((await expectReadable(sender, receiver, local, "Integrity report")).contentHtml).toBe(original.contentHtml);
});

test.each(["draft-cavage-http-signatures-12", "rfc9421"] as const)(
  "%s accepts valid signed content but rejects a stale signature",
  async (spec) => {
    const valid = activity(sender, `Valid ${spec} report`);
    const accepted = await sender.control("sign", { target: `${receiver.origin}/inbox`, activity: valid, spec });
    expect(accepted.status).toBeGreaterThanOrEqual(200);
    expect(accepted.status).toBeLessThan(300);
    await received(receiver, valid.object.id, valid.object.name);
    const stale = activity(sender, `Stale ${spec} report`);
    const at = new Date(Date.now() - 2 * 3600_000).toISOString();
    const result = await sender.control("sign", { target: `${receiver.origin}/inbox`, activity: stale, spec, at });
    expect(result.status).toBe(401);
    expect((await receiver.state()).posts.some((post) => post.apId === stale.object.id)).toBe(false);
  },
);

test("validly signed restricted content is not cached or exposed as a public article", async () => {
  const restricted = activity(sender, "Restricted signed report", false);
  const result = await sender.control("sign", { target: `${receiver.origin}/inbox`, activity: restricted });
  expect(result.status).toBeGreaterThanOrEqual(200);
  expect(result.status).toBeLessThan(300);
  const barrier = activity(sender, "Public processing barrier");
  await sender.control("sign", { target: `${receiver.origin}/inbox`, activity: barrier });
  await received(receiver, barrier.object.id, barrier.object.name);
  expect((await receiver.state()).posts.some((post) => post.apId === restricted.object.id)).toBe(false);
});
