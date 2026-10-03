// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import {
  notificationAction,
  notificationHref,
  notificationIcon,
  notificationSubject,
} from "#lib/components/notifications.js";
import type { Notification } from "#lib/types.js";

const TYPES: Notification["type"][] = [
  "follow",
  "follow_request",
  "follow_accepted",
  "like",
  "comment",
  "reply",
  "comment_like",
  "recommend",
  "post_published",
];

function n(overrides: Partial<Notification>): Notification {
  return {
    id: "n1",
    type: "like",
    read: false,
    createdAt: "2026-01-01T00:00:00Z",
    actor: { id: "a", username: "bob", displayName: "Bob", avatarUrl: null },
    postId: "p1",
    ...overrides,
  } as Notification;
}

test("every type has its own wording and an icon", () => {
  const actions = TYPES.map(notificationAction);
  expect(new Set(actions).size).toBe(TYPES.length);
  for (const t of TYPES) expect(notificationIcon(t)).toBeTruthy();
  expect(notificationIcon("follow_request")).toBe("lock");
  expect(notificationIcon("comment_like")).toBe("heart");
});

test("the subject is the actor, 'Someone' without one, and the post for a scheduled publish", () => {
  expect(notificationSubject(n({}))).toBe("Bob");
  expect(notificationSubject(n({ actor: null }))).toBe("Someone");
  expect(notificationSubject(n({ type: "post_published", actor: null }))).toBe("Your scheduled post");
});

test.for([
  [{ type: "follow_request" }, "/follow-requests"],
  [{ type: "follow" }, "/@bob"],
  [
    {
      type: "follow_accepted",
      actor: { id: "r", username: "eve@remote.example", displayName: "Eve", avatarUrl: null },
    },
    "/@eve@remote.example",
  ],
  [{ type: "follow", actor: null }, null],
  [{ type: "comment" }, "/posts/p1"],
  [{ type: "post_published", actor: null }, "/posts/p1"],
  [{ type: "like", postId: null }, null],
] as const)("%o links to %s", ([overrides, href]) => {
  expect(notificationHref(n(overrides as Partial<Notification>))).toBe(href);
});
