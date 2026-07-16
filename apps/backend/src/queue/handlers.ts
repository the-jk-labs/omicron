// SPDX-License-Identifier: AGPL-3.0-or-later
import { federationRunning } from "@/services/federationState.ts";
import { registerHandler } from "@/queue/queue.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { sendEmailVerification, sendPasswordReset } from "@/services/email.ts";

// Registers all job handlers. Federation modules are imported dynamically so
// Fedify is only loaded when FEDERATION_ENABLED=true; otherwise jobs no-op.

export function registerJobHandlers() {
  registerHandler("federate_post", async ({ postId, action }) => {
    if (!federationRunning()) return;
    const { deliverPost } = await import("@/federation/deliver.ts");
    await deliverPost(postId, action ?? "create");
  });

  // A local post was deleted; tombstone it on remote followers' instances. The
  // row is already gone, so the payload carries the former author id.
  registerHandler("federate_post_delete", async ({ postId, authorId }) => {
    if (!federationRunning()) return;
    const { deliverPostDelete } = await import("@/federation/deliver.ts");
    await deliverPostDelete(postId, authorId);
  });

  // A user edited their own profile (name/bio/email/links/avatar); push an
  // Update(Person) so instances that already cached the old actor refresh it.
  registerHandler("federate_actor_update", async ({ userId }) => {
    if (!federationRunning()) return;
    const { deliverActorUpdate } = await import("@/federation/deliver.ts");
    await deliverActorUpdate(userId);
  });

  registerHandler("federate_list_item", async ({ listId, postId, action }) => {
    if (!federationRunning()) return;
    const { deliverListItem } = await import("@/federation/lists.ts");
    await deliverListItem(listId, postId, action);
  });

  registerHandler("send_follow", async ({ followerId, targetActor }) => {
    if (!federationRunning()) return;
    const { sendFollow } = await import("@/federation/outbound.ts");
    await sendFollow(followerId, targetActor);
  });

  registerHandler("send_unfollow", async ({ followerId, targetActor }) => {
    if (!federationRunning()) return;
    const { sendUnfollow } = await import("@/federation/outbound.ts");
    await sendUnfollow(followerId, targetActor);
  });

  // A local user blocked / unblocked a remote actor; tell the actor's instance
  // with an ActivityPub Block / Undo(Block) so it drops the relationship too.
  registerHandler("send_block", async ({ blockerId, targetActor }) => {
    if (!federationRunning()) return;
    const { sendBlock } = await import("@/federation/outbound.ts");
    await sendBlock(blockerId, targetActor);
  });

  registerHandler("send_unblock", async ({ blockerId, targetActor }) => {
    if (!federationRunning()) return;
    const { sendUndoBlock } = await import("@/federation/outbound.ts");
    await sendUndoBlock(blockerId, targetActor);
  });

  // A local user removed a remote follower; send Reject(Follow) so the actor's
  // instance drops the follow on its side (Mastodon "Remove follower").
  registerHandler("send_reject_follow", async ({ userId, targetActor }) => {
    if (!federationRunning()) return;
    const { sendRejectFollow } = await import("@/federation/outbound.ts");
    await sendRejectFollow(userId, targetActor);
  });

  // A private local user approved a pending remote follow request; send
  // Accept(Follow) so the requester's instance confirms the follow.
  registerHandler("send_accept_follow", async ({ userId, targetActor, followActivityId }) => {
    if (!federationRunning()) return;
    const { sendAcceptFollow } = await import("@/federation/outbound.ts");
    await sendAcceptFollow(userId, targetActor, followActivityId);
  });

  // Account deletion. Broadcast a Delete(actor) to remote followers first (so
  // other instances tombstone us) while the key pair still exists, then remove
  // the user — FK cascades wipe their posts, follows, sessions, mutes & blocks.
  registerHandler("delete_actor", async ({ userId }) => {
    if (federationRunning()) {
      try {
        const { sendActorDelete } = await import("@/federation/outbound.ts");
        await sendActorDelete(userId);
      } catch (err) {
        console.error("delete_actor: federated Delete failed (continuing):", err);
      }
    }
    await usersRepo.remove(userId);
  });

  // Transactional email is delivered off the request path so response latency
  // (and timing) doesn't depend on the mail server or whether an account exists.
  registerHandler("send_password_reset", ({ to, token }) => sendPasswordReset(to, token));
  registerHandler(
    "send_email_verification",
    ({ to, token }) => sendEmailVerification(to, token),
  );
}
