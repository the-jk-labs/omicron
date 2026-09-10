import { registerHandler } from "@/queue/queue.ts";
import {
  sendAccountDeleted,
  sendAccountEmailChanged,
  sendAccountErased,
  sendAccountReinstated,
  sendAccountRestored,
  sendAccountSuspended,
  sendAccountVerified,
  sendAdminGranted,
  sendAdminRevoked,
  sendEmailVerification,
  sendPasswordChanged,
  sendPasswordReset,
} from "@/services/email.ts";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { federationRunning } from "@/services/federationState.ts";

// Registers all job handlers. Federation modules are imported dynamically so
// Fedify is only loaded when FEDERATION_ENABLED=true; otherwise jobs no-op.

export function registerJobHandlers() {
  registerHandler("federate_post", async ({ postId, action }) => {
    if (!federationRunning()) return;
    const { deliverPost } = await import("@/federation/deliver.ts");
    await deliverPost(postId, action ?? "create");
  });

  // Tell IndexNow-participating engines a post appeared or changed. Queued
  // rather than awaited inline so a slow third party never delays a publish,
  // and no-ops unless an admin enabled it (see services/indexNow.ts).
  registerHandler("indexnow_submit", async ({ postId }) => {
    const { submitPost } = await import("@/services/indexNow.ts");
    await submitPost(postId);
  });

  // A local post was deleted; tombstone it on remote followers' instances. The
  // row is already gone, so the payload carries the former author id.
  registerHandler("federate_post_delete", async ({ postId, authorId }) => {
    if (!federationRunning()) return;
    const { deliverPostDelete } = await import("@/federation/deliver.ts");
    await deliverPostDelete(postId, authorId);
  });

  // A local comment was created or edited; fan out a Create(Note) /
  // Update(Note) so it threads under the post on remote instances.
  registerHandler("federate_comment", async ({ commentId, action }) => {
    if (!federationRunning()) return;
    const { deliverComment } = await import("@/federation/deliver.ts");
    await deliverComment(commentId, action ?? "create");
  });

  // A local comment was deleted; tombstone the Note on remote instances. The
  // row is already gone, so the payload carries the former author + post ids.
  registerHandler("federate_comment_delete", async ({ commentId, authorId, postId }) => {
    if (!federationRunning()) return;
    const { deliverCommentDelete } = await import("@/federation/deliver.ts");
    await deliverCommentDelete(commentId, authorId, postId);
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

  // A local user recommended / un-recommended a post; fan out an
  // Announce / Undo(Announce) to their remote followers (a "boost").
  registerHandler("send_recommend", async ({ userId, postId }) => {
    if (!federationRunning()) return;
    const { sendRecommend } = await import("@/federation/outbound.ts");
    await sendRecommend(userId, postId);
  });

  registerHandler("send_unrecommend", async ({ userId, postId }) => {
    if (!federationRunning()) return;
    const { sendUnrecommend } = await import("@/federation/outbound.ts");
    await sendUnrecommend(userId, postId);
  });

  // Account deletion is owned by Better Auth (auth/auth.ts): its beforeDelete
  // hook broadcasts the federated Delete(actor) while the key pair still exists,
  // then Better Auth removes the row and FK cascades wipe the rest.

  // Transactional email is delivered off the request path so response latency
  // (and timing) doesn't depend on the mail server or whether an account exists.
  registerHandler("send_password_reset", ({ to, url }) => sendPasswordReset(to, url));
  registerHandler("send_email_verification", ({ to, url }) => sendEmailVerification(to, url));
  // A moderated account's deletion notice: what happened, what it means, and
  // until when restoration is possible.
  registerHandler("send_account_deleted", ({ to, username, appName, origin, expiresAt }) =>
    sendAccountDeleted(to, { username, appName, origin, expiresAt }),
  );
  // Account lifecycle notices: each states what changed and what to do if it
  // wasn't the owner.
  registerHandler("send_password_changed", ({ to, username, appName, origin }) =>
    sendPasswordChanged(to, { username, appName, origin }),
  );
  registerHandler("send_account_erased", ({ to, username, appName, origin }) =>
    sendAccountErased(to, { username, appName, origin }),
  );
  registerHandler("send_account_suspended", ({ to, username, appName, origin }) =>
    sendAccountSuspended(to, { username, appName, origin }),
  );
  registerHandler("send_account_reinstated", ({ to, username, appName, origin }) =>
    sendAccountReinstated(to, { username, appName, origin }),
  );
  registerHandler("send_account_restored", ({ to, username, appName, origin }) =>
    sendAccountRestored(to, { username, appName, origin }),
  );
  // The admin role was granted or revoked; the affected account is told either way.
  registerHandler("send_admin_granted", ({ to, username, appName, origin }) =>
    sendAdminGranted(to, { username, appName, origin }),
  );
  registerHandler("send_admin_revoked", ({ to, username, appName, origin }) =>
    sendAdminRevoked(to, { username, appName, origin }),
  );
  // An admin manually verified the address, unblocking sign-in.
  registerHandler("send_account_verified", ({ to, username, appName, origin }) =>
    sendAccountVerified(to, { username, appName, origin }),
  );
  // An admin changed the login email: the previous address is told what
  // happened and where to turn if it wasn't the owner. The verification link
  // to the new address goes through the standard verification job.
  registerHandler("send_account_email_changed", ({ to, username, appName, origin, newEmail }) =>
    sendAccountEmailChanged(to, { username, appName, origin, newEmail }),
  );
}
