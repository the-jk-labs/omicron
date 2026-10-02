// SPDX-License-Identifier: AGPL-3.0-or-later
// Unit tests for the inbound visibility gate behind #123: only remote Articles
// addressed to the ActivityStreams Public collection may be cached, so a
// followers-only or direct-message post is never persisted and surfaced on
// anonymous read paths. Also covers how a local post is shaped into the
// Article other instances receive.
import type { Image } from "@fedify/fedify/vocab";
import { Article, Hashtag, LanguageString, PUBLIC_COLLECTION } from "@fedify/fedify/vocab";
import { describe, expect, it } from "vitest";
import { articleLanguage, buildArticle, isPubliclyAddressed } from "@/federation/article.ts";
import { seedFederationOrigin } from "@/services/federationState.ts";
import { postRow } from "../fixtures.ts";
import { fakeContext } from "./fakeContext.ts";

// The minimal shape isPubliclyAddressed reads (Fedify's synchronous `*Ids`
// accessors on an ActivityPub Object).
type Addressed = {
  toIds: URL[];
  ccIds: URL[];
  audienceIds: URL[];
};

const followers = () => new URL("https://remote.example/users/alice/followers");
const bob = () => new URL("https://omicron.example/users/bob");

function obj(o: Partial<Addressed>): Addressed {
  return { toIds: [], ccIds: [], audienceIds: [], ...o };
}

describe("isPubliclyAddressed", () => {
  it("accepts an Article addressed to the Public collection in to", () => {
    expect(isPubliclyAddressed(obj({ toIds: [PUBLIC_COLLECTION] }))).toBe(true);
  });

  it("accepts an Article addressed to Public in cc", () => {
    expect(isPubliclyAddressed(obj({ ccIds: [PUBLIC_COLLECTION] }))).toBe(true);
  });

  it("accepts an Article addressed to Public in audience", () => {
    expect(isPubliclyAddressed(obj({ audienceIds: [PUBLIC_COLLECTION] }))).toBe(true);
  });

  it("rejects a followers-only Article (the #123 reproduction)", () => {
    expect(isPubliclyAddressed(obj({ toIds: [followers()] }))).toBe(false);
  });

  it("rejects an Article addressed only to a specific user", () => {
    expect(isPubliclyAddressed(obj({ toIds: [bob()], ccIds: [followers()] }))).toBe(false);
  });

  it("never treats bcc as publicity", () => {
    // A defensive check: Public in bcc alone must not make a post "public".
    const withBcc = obj({ toIds: [], ccIds: [], audienceIds: [] }) as Addressed & {
      bccIds: URL[];
    };
    withBcc.bccIds = [PUBLIC_COLLECTION];
    expect(isPubliclyAddressed(withBcc)).toBe(false);
  });

  it("rejects an Article with no addressing at all", () => {
    expect(isPubliclyAddressed(obj({}))).toBe(false);
  });
});

describe("buildArticle", () => {
  const ORIGIN = "https://blog.example";
  seedFederationOrigin(ORIGIN);
  const { ctx } = fakeContext(ORIGIN);
  const build = (overrides = {}, tags: { slug: string; name: string }[] = [], audience?: { to: URL; cc?: URL }) =>
    buildArticle(ctx as never, "ada", postRow({ id: "p1", title: "Hello", ...overrides }), tags, audience);

  it("has a stable id and url, the title as name, and the author as attribution", () => {
    const a = build();
    expect(a).toBeInstanceOf(Article);
    expect(a.id?.href).toBe(`${ORIGIN}/posts/p1`);
    expect(a.url?.href).toBe(`${ORIGIN}/posts/p1`);
    expect(a.name?.toString()).toBe("Hello");
    expect(a.attributionId?.href).toBe(`${ORIGIN}/users/ada`);
  });

  it("defaults to to: Public, cc: followers, with a public replies collection", () => {
    const a = build();
    expect(a.toIds.map((u) => u.href)).toEqual([PUBLIC_COLLECTION.href]);
    expect(a.ccIds.map((u) => u.href)).toEqual([`${ORIGIN}/users/ada/followers`]);
    expect(a.repliesId?.href).toBe(`${ORIGIN}/users/ada/posts/p1/replies`);
  });

  it("a followers-only audience drops Public and the replies link", () => {
    const a = build({}, [], { to: new URL(`${ORIGIN}/users/ada/followers`) });
    expect(a.toIds.map((u) => u.href)).toEqual([`${ORIGIN}/users/ada/followers`]);
    expect(a.ccIds).toEqual([]);
    expect(a.repliesId).toBe(null);
  });

  it("tags the content with its language when the author declared one", () => {
    expect(build({ language: "pt" }).content).toBeInstanceOf(LanguageString);
    expect(typeof build({ language: null }).content).toBe("string");
  });

  it("carries summary, an absolute banner and hashtags", async () => {
    const a = build({ summary: "Short", coverUrl: "/api/uploads/b.png" }, [{ slug: "deno", name: "Deno" }]);
    expect(a.summary?.toString()).toBe("Short");
    const image = (await a.getImage()) as Image;
    expect(image.url?.href).toBe(`${ORIGIN}/api/uploads/b.png`);
    const tags: Hashtag[] = [];
    for await (const t of a.getTags()) if (t instanceof Hashtag) tags.push(t);
    expect(tags.map((t) => [t.name?.toString(), t.href?.href])).toEqual([["#Deno", `${ORIGIN}/tags/deno`]]);
  });

  it("an untitled post has no name", () => {
    expect(build({ title: null }).name).toBe(null);
  });
});

describe("articleLanguage", () => {
  it("reads and normalizes a tagged language", () => {
    expect(articleLanguage(new Article({ content: new LanguageString("x", "pt-BR") }))).toBe("pt");
  });

  it("is null for untagged content", () => {
    expect(articleLanguage(new Article({ content: "x" }))).toBe(null);
    expect(articleLanguage(new Article({}))).toBe(null);
  });
});
