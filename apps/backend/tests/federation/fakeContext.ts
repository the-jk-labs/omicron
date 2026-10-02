// SPDX-License-Identifier: AGPL-3.0-or-later
// A stand-in for the slice of a Fedify Context the delivery code uses: URI
// builders, actor lookup (from a registry the test fills) and sendActivity,
// which records what would have gone out instead of signing and POSTing it.
// Activities are real Fedify vocab objects, so tests assert on what remote
// instances would receive.
import type { Activity, Actor } from "@fedify/fedify/vocab";
import { Person } from "@fedify/fedify/vocab";
import { vi } from "vitest";

export type Sent = { sender: string; recipients: string[]; activity: Activity };

export function fakeContext(origin: string) {
  const actors = new Map<string, Actor>();
  const sent: Sent[] = [];
  const ctx = {
    getActorUri: (id: string) => new URL(`/users/${id}`, origin),
    getFollowersUri: (id: string) => new URL(`/users/${id}/followers`, origin),
    getInboxUri: (id?: string) => new URL(id ? `/users/${id}/inbox` : "/inbox", origin),
    getOutboxUri: (id: string) => new URL(`/users/${id}/outbox`, origin),
    getObjectUri: (_cls: unknown, values: Record<string, string>) =>
      new URL(`/users/${values.identifier}/lists/${values.listId}`, origin),
    getActorKeyPairs: vi.fn<() => Promise<never[]>>(async () => []),
    lookupObject: vi.fn<(uri: string | URL) => Promise<Actor | null>>(async (uri) => actors.get(String(uri)) ?? null),
    sendActivity: vi.fn<
      (sender: { identifier: string }, recipients: Actor | Actor[], activity: Activity) => Promise<void>
    >(async (sender, recipients, activity) => {
      const list = Array.isArray(recipients) ? recipients : [recipients];
      sent.push({ sender: sender.identifier, recipients: list.map((a) => a.id!.href), activity });
    }),
  };
  return {
    ctx,
    sent,
    /** Registers a remote actor that lookupObject will resolve. */
    remote(uri: string) {
      const actor = new Person({ id: new URL(uri), inbox: new URL(`${uri}/inbox`) });
      actors.set(uri, actor);
      return actor;
    },
    reset() {
      sent.length = 0;
      actors.clear();
    },
  };
}
