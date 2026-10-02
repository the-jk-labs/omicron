// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Context } from "@fedify/fedify";
// buildPerson runs against a real Fedify context (the app's own federation
// object); only the two repositories it reads are stubbed.
import type { PropertyValue } from "@fedify/fedify/vocab";
import { Hashtag, Image } from "@fedify/fedify/vocab";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { userRow } from "../fixtures.ts";

vi.mock(import("@/db/repositories/profileLinks.ts"));
vi.mock(import("@/db/repositories/readingLists.ts"));

import * as linksRepo from "@/db/repositories/profileLinks.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import { buildPerson } from "@/federation/actor.ts";
import { getFederation } from "@/federation/mod.ts";
import { seedFederationOrigin } from "@/services/federationState.ts";

const ORIGIN = "https://blog.example";
let ctx: Context<undefined>;

beforeAll(() => {
  seedFederationOrigin(ORIGIN);
  ctx = getFederation().createContext(new URL(ORIGIN), undefined);
});

beforeEach(() => {
  vi.mocked(linksRepo.listForUser).mockResolvedValue([]);
  vi.mocked(listsRepo.listForUser).mockResolvedValue([]);
});

function link(platform: string, url: string, label = "") {
  return { id: `l-${platform}`, userId: "u", platform, url, label, position: 0 } as never;
}

describe("buildPerson", () => {
  test("describes the actor's identity, endpoints and profile page", async () => {
    const p = await buildPerson(ctx, "ada", userRow({ displayName: "Ada", bio: "Hello" }), [], []);
    expect(p.id?.href).toBe(`${ORIGIN}/users/ada`);
    expect(p.preferredUsername).toBe("ada");
    expect(p.name?.toString()).toBe("Ada");
    expect(p.inboxId?.href).toBe(`${ORIGIN}/users/ada/inbox`);
    expect(p.outboxId?.href).toBe(`${ORIGIN}/users/ada/outbox`);
    expect(p.followersId?.href).toBe(`${ORIGIN}/users/ada/followers`);
    expect(p.endpoints?.sharedInbox?.href).toBe(`${ORIGIN}/inbox`);
    // Humans land on the reading page, not the JSON-LD actor document.
    expect(p.url?.href).toBe(`${ORIGIN}/@ada`);
  });

  test("a private account asks remote instances to hold follows for approval", async () => {
    expect((await buildPerson(ctx, "ada", userRow({ isPrivate: true }), [], [])).manuallyApprovesFollowers).toBe(true);
    expect((await buildPerson(ctx, "ada", userRow({ isPrivate: false }), [], [])).manuallyApprovesFollowers).toBe(
      false,
    );
  });

  test("a local avatar is published as an absolute URL; no avatar, no icon", async () => {
    const withAvatar = await buildPerson(ctx, "ada", userRow({ avatarUrl: "/api/uploads/a.png" }), [], []);
    const icon = await withAvatar.getIcon();
    expect(icon).toBeInstanceOf(Image);
    expect((icon as Image).url?.href).toBe(`${ORIGIN}/api/uploads/a.png`);
    expect(await (await buildPerson(ctx, "ada", userRow(), [], [])).getIcon()).toBe(null);
  });

  test("profile tags federate as hashtags linking to the tag page", async () => {
    const p = await buildPerson(ctx, "ada", userRow(), [{ slug: "deno", name: "Deno" }], []);
    const tags = [];
    for await (const t of p.getTags()) tags.push(t);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toBeInstanceOf(Hashtag);
    expect((tags[0] as Hashtag).name?.toString()).toBe("#Deno");
    expect((tags[0] as Hashtag).href?.href).toBe(`${ORIGIN}/tags/deno`);
  });

  test("public reading lists are advertised as streams; private ones are never read", async () => {
    vi.mocked(listsRepo.listForUser).mockResolvedValue([{ id: "list-1" }] as never);
    const p = await buildPerson(ctx, "ada", userRow({ id: "u1" }), [], []);
    expect(listsRepo.listForUser).toHaveBeenCalledWith("u1", true);
    expect(p.streamIds.map((u) => u.href)).toEqual([expect.stringContaining("list-1")]);
  });

  test("profile links become rel=me PropertyValues with escaped, scheme-free text", async () => {
    vi.mocked(linksRepo.listForUser).mockResolvedValue([
      link("github", "https://github.com/ada"),
      link("custom", 'https://x.example/?a="1"&b=<2>', "My site"),
      link("custom", "https://y.example/", ""),
    ]);
    const p = await buildPerson(ctx, "ada", userRow({ publicEmail: "ada@x.test" }), [], []);
    const fields: PropertyValue[] = [];
    for await (const a of p.getAttachments()) fields.push(a as PropertyValue);
    expect(fields.map((f) => f.name?.toString())).toEqual(["Email", "GitHub", "My site", "Link"]);
    expect(fields[0].value?.toString()).toBe("ada@x.test");
    expect(fields[1].value?.toString()).toBe(
      '<a href="https://github.com/ada" target="_blank" rel="nofollow noopener noreferrer me" translate="no">github.com/ada</a>',
    );
    // The URL never breaks out of its attribute.
    expect(fields[2].value?.toString()).toContain('href="https://x.example/?a=&quot;1&quot;&amp;b=&lt;2&gt;"');
    expect(fields[2].value?.toString()).not.toContain("<2>");
  });

  test("no public email, no Email field", async () => {
    const p = await buildPerson(ctx, "ada", userRow({ publicEmail: "" }), [], []);
    const fields = [];
    for await (const a of p.getAttachments()) fields.push(a);
    expect(fields).toEqual([]);
  });

  // BUG: ActivityPub's `summary` is HTML, but the local bio is plain text and
  // is sent as-is. A bio such as "I <3 cats & dogs" arrives as broken markup on
  // Mastodon (and newlines collapse); comments already go through
  // textToNoteHtml for exactly this reason, the actor bio does not.
  test.fails("BUG: the plain-text bio is published as escaped HTML", async () => {
    const p = await buildPerson(ctx, "ada", userRow({ bio: "I <3 cats & dogs" }), [], []);
    expect(p.summary?.toString()).toBe("<p>I &lt;3 cats &amp; dogs</p>");
  });
});
