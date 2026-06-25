// SPDX-License-Identifier: AGPL-3.0-or-later
import { config } from "@/config.ts";
import { registerHandler } from "@/queue/queue.ts";
import * as usersRepo from "@/db/repositories/users.ts";

// Registers all job handlers. Federation modules are imported dynamically so
// Fedify is only loaded when FEDERATION_ENABLED=true; otherwise jobs no-op.

export function registerJobHandlers() {
  registerHandler("federate_post", async ({ postId }) => {
    if (!config.FEDERATION_ENABLED) return;
    const { deliverPost } = await import("@/federation/deliver.ts");
    await deliverPost(postId);
  });

  registerHandler("send_follow", async ({ followerId, targetActor }) => {
    if (!config.FEDERATION_ENABLED) return;
    const { sendFollow } = await import("@/federation/outbound.ts");
    await sendFollow(followerId, targetActor);
  });

  registerHandler("send_unfollow", async ({ followerId, targetActor }) => {
    if (!config.FEDERATION_ENABLED) return;
    const { sendUnfollow } = await import("@/federation/outbound.ts");
    await sendUnfollow(followerId, targetActor);
  });

  // Account deletion. Broadcast a Delete(actor) to remote followers first (so
  // other instances tombstone us) while the key pair still exists, then remove
  // the user — FK cascades wipe their posts, follows, sessions, mutes & blocks.
  registerHandler("delete_actor", async ({ userId }) => {
    if (config.FEDERATION_ENABLED) {
      try {
        const { sendActorDelete } = await import("@/federation/outbound.ts");
        await sendActorDelete(userId);
      } catch (err) {
        console.error("delete_actor: federated Delete failed (continuing):", err);
      }
    }
    await usersRepo.remove(userId);
  });
}
