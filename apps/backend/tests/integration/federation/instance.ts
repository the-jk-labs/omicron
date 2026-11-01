import process from "node:process";
// SPDX-License-Identifier: AGPL-3.0-or-later
import type { FederationOptions } from "@fedify/fedify";
import { signRequest } from "@fedify/fedify/sig";
import { serve } from "srvx";
import { expect, test, vi } from "vitest";
import { buildApp } from "@/app.ts";
import { auth } from "@/auth/auth.ts";
import { config } from "@/config.ts";
import { db } from "@/db/client.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { posts } from "@/db/schema.ts";
import { deliverPost } from "@/federation/deliver.ts";
import { getFederation } from "@/federation/mod.ts";
import { seedFederationOrigin, seedFederationRunning } from "@/services/federationState.ts";
import { closeDb, mkSession, mkUser, resetDb } from "../harness.ts";
import { READY_PREFIX, type InboxRequest } from "./protocol.ts";

// Only transport policy changes: every dispatcher, signature and SQL call stays real.
vi.mock(import("@fedify/fedify"), async (original) => {
  const actual = await original();
  return {
    ...actual,
    createFederation: <T>(options: FederationOptions<T>) => {
      if (options.skipSignatureVerification !== false)
        throw new Error("Federation tests require signature verification.");
      return actual.createFederation({ ...options, allowPrivateAddress: true });
    },
  };
});

test("serve one isolated Omicron instance until its parent requests shutdown", async () => {
  expect(new URL(config.DATABASE_URL).pathname).toMatch(/^\/omicron_fed_[a-f0-9]{32}$/);
  const controlToken = process.env.FEDERATION_TEST_CONTROL;
  expect(controlToken).toBeTruthy();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname)) {
      throw new Error("Federation test traffic must stay on loopback.");
    }
    return realFetch(input, init);
  };

  const stop = new AbortController();
  const shutdown = Promise.withResolvers<void>();
  const built = Promise.withResolvers<Awaited<ReturnType<typeof buildApp>>>();
  const inbox: InboxRequest[] = [];
  let actorFetches = 0;
  const server = serve({
    hostname: "127.0.0.1",
    port: 0,
    silent: true,
    gracefulShutdown: false,
    fetch: async (request) => {
      const app = await built.promise;
      const path = new URL(request.url).pathname;
      if (path.startsWith("/__test__/")) {
        if (request.headers.get("x-test-control") !== controlToken) return new Response(null, { status: 403 });
        if (path === "/__test__/state") {
          return Response.json({
            inbox,
            actorFetches,
            posts: await db
              .select({
                id: posts.id,
                apId: posts.apId,
                contentHtml: posts.contentHtml,
                language: posts.language,
                remote: posts.remote,
                title: posts.title,
              })
              .from(posts),
          });
        }
        if (path === "/__test__/shutdown") {
          setImmediate(shutdown.resolve);
          return Response.json({ ok: true });
        }
        const body = await request.json();
        if (path === "/__test__/follower") {
          const user = await usersRepo.findByUsername(body.username ?? "writer");
          if (!user) throw new Error("Test author not found.");
          await followsRepo.createRemoteFollower(user.id, body.actor);
          return Response.json({ ok: true });
        }
        if (path === "/__test__/deliver") {
          await deliverPost(body.postId, body.action);
          return Response.json({ ok: true });
        }
        if (path === "/__test__/sign") {
          const ctx = getFederation().createContext(new URL(origin), undefined);
          const [key] = await ctx.getActorKeyPairs(body.signer ?? "writer");
          const target = new URL(body.target);
          const signed = await signRequest(
            new Request(target, {
              method: "POST",
              headers: { "content-type": "application/activity+json" },
              body: JSON.stringify(body.activity),
            }),
            key.privateKey,
            key.keyId,
            { spec: body.spec, currentTime: body.at ? Temporal.Instant.from(body.at) : undefined },
          );
          const result = await fetch(signed);
          return Response.json({ status: result.status, body: await result.text() });
        }
        return new Response(null, { status: 404 });
      }
      if (request.method === "GET" && path.startsWith("/users/")) actorFetches++;
      const record =
        request.method === "POST" && path.endsWith("/inbox")
          ? {
              path,
              body: await request.clone().text(),
              headers: Object.fromEntries(request.headers),
              status: 0,
            }
          : null;
      const response = await app.fetch(request);
      if (record) {
        record.status = response.status;
        inbox.push(record);
      }
      return response;
    },
  });
  let processing: Promise<void> | undefined;
  let origin: string;
  try {
    await resetDb();
    await server.ready();
    origin = `http://localhost:${new URL(server.url!).port}`;
    config.APP_DOMAIN = new URL(origin).host;
    seedFederationOrigin(origin);
    seedFederationRunning(true);
    const user = await mkUser("writer");
    await mkUser("intruder");
    const at = new Date();
    await mkSession(user.id, at);
    const app = await buildApp();
    built.resolve(app);
    processing = getFederation().startQueue(undefined, { signal: stop.signal });
    // Pre-generate keys before peers can fetch the same actor concurrently.
    await getFederation().createContext(new URL(origin), undefined).getActorKeyPairs("writer");
    const cookieName = (await auth.$context).authCookies.sessionToken.name;
    process.stdout.write(
      `${READY_PREFIX}${JSON.stringify({ origin, userId: user.id, sessionAt: at.getTime(), cookieName })}\n`,
    );
    await shutdown.promise;
  } finally {
    stop.abort();
    await processing;
    await server.close(true);
    await closeDb();
    globalThis.fetch = realFetch;
  }
});
