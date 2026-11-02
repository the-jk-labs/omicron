// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, describe, expect, test, vi } from "vitest";
import { postWithAuthor, userRow } from "../fixtures.ts";

vi.mock(import("@/db/repositories/notifications.ts"));
vi.mock(import("@/db/repositories/relations.ts"));
vi.mock(import("@/db/repositories/users.ts"));
vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/services/federationState.ts"), () => ({ federationOrigin: () => "https://omicron.test" }));

import * as followsRepo from "@/db/repositories/follows.ts";
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { MAX_MENTIONS, notifyMentions, parseLocalMentions } from "@/services/mentions.ts";

describe("parseLocalMentions", () => {
  test.for([
    ["hi @ada", ["ada"]],
    ["@ada, @bob_2 and @ada again", ["ada", "bob_2"]],
    ["@Ada", ["ada"]],
    ["(@ada)", ["ada"]],
    ["@ada.", ["ada"]],
    ["@ada@omicron.test", ["ada"]],
    ["@ada@OMICRON.test", ["ada"]],
    ["@ada@mastodon.social", []],
    ["mail me@ada.dev", []],
    ["a@ada", []],
    ["@", []],
    ["@ada-lovelace", ["ada"]],
    [`@${"a".repeat(31)}`, []],
  ] as const)("%j → %j", ([text, names]) => {
    expect(parseLocalMentions(text, "omicron.test")).toEqual(names);
  });

  test(`keeps at most ${MAX_MENTIONS} names`, () => {
    const text = Array.from({ length: 15 }, (_, i) => `@user${i}`).join(" ");
    expect(parseLocalMentions(text, "omicron.test")).toHaveLength(MAX_MENTIONS);
  });
});

describe("notifyMentions", () => {
  const post = postWithAuthor({ id: "p1" }, { id: "author" });

  beforeEach(() => {
    vi.mocked(relationsRepo.localBlockExists).mockResolvedValue(false);
    vi.mocked(relationsRepo.hasRemote).mockResolvedValue(false);
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "author", isPrivate: false }));
    vi.mocked(usersRepo.findActiveByUsernames).mockImplementation(async (names) =>
      names.map((username) => ({ id: `id-${username}`, username })),
    );
  });

  const recipients = () => vi.mocked(notificationsRepo.create).mock.calls.map(([n]) => n.recipientId);

  test("notifies each named local account with a mention", async () => {
    await notifyMentions({ text: "@ada @bob", post, commentId: "c1", actorId: "viewer" });
    expect(usersRepo.findActiveByUsernames).toHaveBeenCalledWith(["ada", "bob"]);
    expect(notificationsRepo.create).toHaveBeenCalledWith({
      recipientId: "id-ada",
      type: "mention",
      actorId: "viewer",
      remoteActorId: null,
      postId: "p1",
      commentId: "c1",
    });
    expect(recipients()).toEqual(["id-ada", "id-bob"]);
  });

  test("skips the writer and anyone already notified", async () => {
    await notifyMentions({
      text: "@ada @bob @me",
      post,
      commentId: "c1",
      actorId: "id-me",
      skip: ["id-ada", null],
    });
    expect(recipients()).toEqual(["id-bob"]);
  });

  test("does nothing without a mention", async () => {
    await notifyMentions({ text: "no one here", post, commentId: "c1", actorId: "viewer" });
    expect(usersRepo.findActiveByUsernames).not.toHaveBeenCalled();
    expect(notificationsRepo.create).not.toHaveBeenCalled();
  });

  test("a block either way silences the mention", async () => {
    vi.mocked(relationsRepo.localBlockExists).mockImplementation(async (a) => a === "id-ada");
    await notifyMentions({ text: "@ada @bob", post, commentId: "c1", actorId: "viewer" });
    expect(recipients()).toEqual(["id-bob"]);
  });

  test("a remote writer the recipient blocked is silenced", async () => {
    vi.mocked(relationsRepo.hasRemote).mockImplementation(async (_kind, userId) => userId === "id-ada");
    await notifyMentions({ text: "@ada @bob", post, commentId: "c1", remoteActorId: "actor" });
    expect(recipients()).toEqual(["id-bob"]);
    expect(notificationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: null, remoteActorId: "actor" }),
    );
  });

  test("nobody hears about a private author's post they can't open", async () => {
    vi.mocked(usersRepo.findById).mockResolvedValue(userRow({ id: "author", isPrivate: true }));
    vi.mocked(followsRepo.isFollowing).mockImplementation(async (follower) => follower === "id-bob");
    await notifyMentions({ text: "@ada @bob", post, commentId: "c1", actorId: "viewer" });
    expect(recipients()).toEqual(["id-bob"]);
  });

  test("a lookup failure never throws", async () => {
    vi.mocked(usersRepo.findActiveByUsernames).mockRejectedValue(new Error("db down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyMentions({ text: "@ada", post, commentId: "c1", actorId: "v" })).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
