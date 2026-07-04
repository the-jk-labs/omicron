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
