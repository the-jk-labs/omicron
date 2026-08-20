// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NodeInfo } from "@fedify/fedify";
import * as commentsRepo from "@/db/repositories/comments.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { getAppName } from "@/services/instanceSetup.ts";
import { APP_VERSION } from "@/version.ts";

// What this instance tells the fediverse about itself.
//
// NodeInfo is the protocol every directory reads — FediDB, fedidb.org,
// instances.social — and the one a peer reads to learn what software it is
// talking to. Without it the instance is invisible to all of them: it federates
// fine, but it appears in no listing and no statistic, which is most of how a
// small instance is found at all. Served at /nodeinfo/2.1 and pointed to from
// /.well-known/nodeinfo; both are wired up in federation/nodeinfo.ts.
//
// Everything here is an aggregate. No title, no handle, no address ever leaves
// through this document — only counts, the software name, and the instance's own
// display name, which is on every page already.

// NodeInfo's two activity windows, defined by the spec as the users who signed
// in within the last 30 and 180 days.
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const HALFYEAR_MS = 180 * 24 * 60 * 60 * 1000;

export async function nodeInfo(): Promise<NodeInfo> {
  const now = Date.now();
  const [name, total, activeMonth, activeHalfyear, localPosts, localComments] = await Promise.all([
    getAppName(),
    usersRepo.countUsers(),
    usersRepo.countActiveSince(new Date(now - MONTH_MS)),
    usersRepo.countActiveSince(new Date(now - HALFYEAR_MS)),
    postsRepo.countLocalPublished(),
    commentsRepo.countAll(),
  ]);

  return {
    software: {
      // Lowercase and hyphen-only: NodeInfo requires it, and Fedify rejects the
      // document outright otherwise. This is the key directories group instances
      // by, so it must stay "omicron" across every release and every fork that
      // has not renamed itself.
      name: "omicron",
      version: APP_VERSION,
      repository: new URL("https://github.com/the-jk-labs/omicron"),
    },
    protocols: ["activitypub"],
    services: {
      // Nothing is ingested from another network; every profile and reading list
      // publishes an RSS feed (see the frontend's feed.xml routes).
      inbound: [],
      outbound: ["rss2.0"],
    },
    // Registration is open on every Omicron instance: /api/auth/register takes
    // anyone, rate-limited but ungated. Revisit this the day an invite or
    // approval mode lands, or the document will be advertising a door that is
    // no longer open.
    openRegistrations: true,
    usage: {
      users: { total, activeMonth, activeHalfyear },
      localPosts,
      localComments,
    },
    // `nodeName` is what a directory prints as the instance's title. Not part of
    // the 2.1 schema proper, but the field Mastodon publishes and every
    // directory reads, so an instance that omits it is listed by bare hostname.
    metadata: { nodeName: name },
  };
}

// The same document in the 2.0 schema.
//
// Both versions are published because the fediverse reads both: 2.1 is what
// Fedify serves and what this instance prefers, but Mastodon — and so a good
// share of the crawlers written against it — only ever exposed 2.0, and a
// directory that hardcodes that rel would otherwise see nothing here. Every
// large implementation (Lemmy, Misskey, GoToSocial) answers on both for the same
// reason.
//
// 2.0 has no `repository`/`homepage` on `software` and no `$schema` key, so this
// is 2.1 minus what 2.0 has no field for — never a separate set of facts.
export async function nodeInfo20(): Promise<Record<string, unknown>> {
  const info = await nodeInfo();
  return {
    version: "2.0",
    software: { name: info.software.name, version: info.software.version },
    protocols: [...info.protocols],
    services: {
      inbound: [...(info.services?.inbound ?? [])],
      outbound: [...(info.services?.outbound ?? [])],
    },
    openRegistrations: info.openRegistrations ?? false,
    usage: info.usage,
    metadata: info.metadata ?? {},
  };
}
