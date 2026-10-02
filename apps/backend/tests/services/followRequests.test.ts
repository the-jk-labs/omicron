// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test, vi } from "vitest";

vi.mock(import("@/db/repositories/follows.ts"));
vi.mock(import("@/db/repositories/notifications.ts"));
vi.mock(import("@/queue/queue.ts"), () => ({ queue: { add: vi.fn<(...args: unknown[]) => void>() } as never }));

import * as followsRepo from "@/db/repositories/follows.ts";
import * as notificationsRepo from "@/db/repositories/notifications.ts";
import { queue } from "@/queue/queue.ts";
import { approve, list, reject } from "@/services/followRequests.ts";

type InboundEdge = Awaited<ReturnType<typeof followsRepo.findInboundRequest>>;

describe("list", () => {
  test("merges local and remote requests newest first", async () => {
    vi.mocked(followsRepo.listLocalFollowRequests).mockResolvedValue([
      { followId: "f1", id: "u1", username: "ann", displayName: "Ann", avatarUrl: null, createdAt: new Date(1_000) },
      { followId: "f3", id: "u3", username: "cy", displayName: "Cy", avatarUrl: null, createdAt: new Date(3_000) },
    ] as never);
    vi.mocked(followsRepo.listRemoteFollowRequests).mockResolvedValue([
      {
        followId: "f2",
        id: "a2",
        handle: "bob@x.example",
        displayName: "",
        avatarUrl: null,
        createdAt: new Date(2_000),
      },
    ] as never);
    const items = await list("me");
    expect(items.map((i) => i.requestId)).toEqual(["f3", "f2", "f1"]);
    expect(items[1].actor).toEqual({
      id: "a2",
      username: "bob@x.example",
      displayName: "bob@x.example",
      avatarUrl: null,
      remote: true,
    });
    expect(items[0].actor.remote).toBe(false);
  });

  test("is empty when nobody asked", async () => {
    vi.mocked(followsRepo.listLocalFollowRequests).mockResolvedValue([] as never);
    vi.mocked(followsRepo.listRemoteFollowRequests).mockResolvedValue([] as never);
    expect(await list("me")).toEqual([]);
  });
});

describe("approve", () => {
  test("404s on an unknown request", async () => {
    vi.mocked(followsRepo.findInboundRequest).mockResolvedValue(undefined as InboundEdge);
    await expect(approve("me", "nope")).rejects.toMatchObject({ status: 404, message: "Follow request not found." });
    expect(followsRepo.approve).not.toHaveBeenCalled();
  });

  test("approves a local request and tells the requester", async () => {
    vi.mocked(followsRepo.findInboundRequest).mockResolvedValue({
      id: "f1",
      followerId: "u1",
      remoteActor: null,
      followActivityId: null,
    } as InboundEdge);
    await approve("me", "f1");
    expect(followsRepo.approve).toHaveBeenCalledWith("f1");
    expect(notificationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "u1", type: "follow_accepted", actorId: "me" }),
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("approves a remote request and federates Accept with the original Follow id", async () => {
    vi.mocked(followsRepo.findInboundRequest).mockResolvedValue({
      id: "f2",
      followerId: null,
      remoteActor: "https://x.example/users/bob",
      followActivityId: "https://x.example/follows/9",
    } as InboundEdge);
    await approve("me", "f2");
    expect(queue.add).toHaveBeenCalledWith("send_accept_follow", {
      userId: "me",
      targetActor: "https://x.example/users/bob",
      followActivityId: "https://x.example/follows/9",
    });
    expect(notificationsRepo.create).not.toHaveBeenCalled();
  });
});

describe("reject", () => {
  test("404s on an unknown request", async () => {
    vi.mocked(followsRepo.findInboundRequest).mockResolvedValue(undefined as InboundEdge);
    await expect(reject("me", "nope")).rejects.toMatchObject({ status: 404 });
    expect(followsRepo.removeById).not.toHaveBeenCalled();
  });

  test("drops a local request silently", async () => {
    vi.mocked(followsRepo.findInboundRequest).mockResolvedValue({
      id: "f1",
      followerId: "u1",
      remoteActor: null,
      followActivityId: null,
    } as InboundEdge);
    await reject("me", "f1");
    expect(followsRepo.removeById).toHaveBeenCalledWith("f1");
    expect(queue.add).not.toHaveBeenCalled();
  });

  test("drops a remote request and federates Reject", async () => {
    vi.mocked(followsRepo.findInboundRequest).mockResolvedValue({
      id: "f2",
      followerId: null,
      remoteActor: "https://x.example/users/bob",
      followActivityId: null,
    } as InboundEdge);
    await reject("me", "f2");
    expect(queue.add).toHaveBeenCalledWith("send_reject_follow", {
      userId: "me",
      targetActor: "https://x.example/users/bob",
    });
  });
});
