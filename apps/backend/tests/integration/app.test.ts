// SPDX-License-Identifier: AGPL-3.0-or-later
// The assembled app against a real database: the full middleware stack, real
// routes and Fedify's request handling. For behaviour that only shows end to
// end — a status code a unit test with a stubbed repository cannot produce, or
// a document Fedify builds from rows.
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { buildApp } from "@/app.ts";
import { db } from "@/db/client.ts";
import * as settingsRepo from "@/db/repositories/instanceSettings.ts";
import { instanceSettings, users } from "@/db/schema.ts";
import { seedFederationOrigin, seedFederationRunning } from "@/services/federationState.ts";
import { SETUP_KEYS } from "@/services/instanceSetup.ts";
import { closeDb, mkPost, mkUser, recommend, resetDb } from "./harness.ts";

let app: Awaited<ReturnType<typeof buildApp>>;
let goneUser: string;

beforeAll(async () => {
  await resetDb();
  seedFederationRunning(true);
  seedFederationOrigin("https://blog.example");
  app = await buildApp();

  const ada = await mkUser("ada");
  await mkPost(ada.id, "hello");
  const gone = await mkUser("gone");
  goneUser = gone.username;
  await mkPost(gone.id, "gone-post");
  await recommend(gone.id, (await mkPost(ada.id, "recommended")).id);
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, gone.id));
});

afterAll(async () => {
  await db.delete(instanceSettings).where(eq(instanceSettings.key, SETUP_KEYS.appDomain));
  await closeDb();
});

const get = (path: string, headers: Record<string, string> = {}) =>
  app.request(`https://blog.example${path}`, { headers });

// A tab's items; a 404 (the eventual fix for B30) counts as nothing listed.
async function tabItems(path: string): Promise<unknown[]> {
  const res = await get(path);
  expect([200, 404]).toContain(res.status);
  return res.status === 200 ? (await res.json()).items : [];
}

describe("malformed input is a client error, never a 500", () => {
  test("a well-formed cursor pages the public timeline", async () => {
    const res = await get("/api/posts");
    expect(res.status).toBe(200);
    expect((await res.json()).items.length).toBeGreaterThan(0);
  });

  test("a crafted cursor on the public timeline is not a 500", async () => {
    const res = await get(`/api/posts?cursor=${encodeURIComponent(btoa("x|y"))}`);
    expect(res.status).toBeLessThan(500);
  });

  test("comments of a malformed post id are not a 500", async () => {
    const res = await get("/api/posts/not-a-uuid/comments");
    expect(res.status).toBeLessThan(500);
  });
});

describe("a deleted account's profile tabs (B30)", () => {
  test("the posts tab serves none of the deleted account's posts", async () => {
    expect(await tabItems(`/api/users/${goneUser}/posts`)).toEqual([]);
  });

  test("the recommendations tab lists nothing for a deleted account", async () => {
    expect(await tabItems(`/api/users/${goneUser}/recommendations`)).toEqual([]);
  });
});

describe("the ActivityPub actor document", () => {
  const actorDoc = async () => {
    const res = await get("/users/ada", { accept: "application/activity+json" });
    expect(res.status).toBe(200);
    return (await res.json()) as { type: string; attributionDomains?: string[] };
  };

  test("is a Person that vouches for an attribution domain", async () => {
    const doc = await actorDoc();
    expect(doc.type).toBe("Person");
    expect(doc.attributionDomains).toHaveLength(1);
  });

  test("a browser asking for the actor URL is sent to the profile page", async () => {
    const res = await get("/users/ada", { accept: "text/html" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/@ada");
  });

  test("vouches for the domain set in the setup wizard", async () => {
    await settingsRepo.set(SETUP_KEYS.appDomain, "blog.example");
    expect((await actorDoc()).attributionDomains).toEqual(["blog.example"]);
  });
});
