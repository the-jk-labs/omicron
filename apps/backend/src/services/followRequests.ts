// SPDX-License-Identifier: AGPL-3.0-or-later
import * as followsRepo from "@/db/repositories/follows.ts";
import * as notifications from "@/services/notifications.ts";
import { relationActorLocal, relationActorRemote } from "@/routes/serializers.ts";
import { notFound } from "@/lib/http.ts";
import { queue } from "@/queue/queue.ts";

// Business logic for the follow-request inbox of a private account. A request is
// an unapproved inbound follow edge (see follows.approved). The owner approves
// it — turning it into an ordinary follow (and, for a remote requester, sending
// Accept) — or rejects it, dropping the edge (and sending Reject to a remote).

// Pending requests for a user, local + remote, as a flat list with the
// follow-edge id (`requestId`) the approve/reject actions key on.
export async function list(userId: string) {
  const [local, remote] = await Promise.all([
    followsRepo.listLocalFollowRequests(userId),
    followsRepo.listRemoteFollowRequests(userId),
  ]);
  const items = [
    ...local.map((r) => ({
      requestId: r.followId,
      actor: relationActorLocal(r),
      createdAt: r.createdAt,
    })),
    ...remote.map((r) => ({
      requestId: r.followId,
      actor: relationActorRemote(r),
      createdAt: r.createdAt,
    })),
  ];
  // Newest first across both sources.
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return items;
}

export async function approve(userId: string, requestId: string) {
  const edge = await followsRepo.findInboundRequest(userId, requestId);
  if (!edge) throw notFound("Follow request not found.");
  await followsRepo.approve(edge.id);

  if (edge.followerId) {
    // Local requester: tell them their request was accepted.
    await notifications.notify({
      recipientId: edge.followerId,
      type: "follow_accepted",
      actorId: userId,
    });
  } else if (edge.remoteActor) {
    // Remote requester: send Accept(Follow) so their instance confirms the follow.
    queue.add("send_accept_follow", {
      userId,
      targetActor: edge.remoteActor,
      followActivityId: edge.followActivityId,
    });
  }
}

export async function reject(userId: string, requestId: string) {
  const edge = await followsRepo.findInboundRequest(userId, requestId);
  if (!edge) throw notFound("Follow request not found.");
  await followsRepo.removeById(edge.id);

  // Remote requester: send Reject so their instance drops the pending follow.
  // (The "requested to follow you" notification stays as history; the request
  // list itself is driven by the follow edges, which are now gone.)
  if (edge.remoteActor) {
    queue.add("send_reject_follow", { userId, targetActor: edge.remoteActor });
  }
}
