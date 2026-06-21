import { Create, isActor, PUBLIC_COLLECTION } from "@fedify/fedify/vocab";
import { getFederation } from "@/federation/mod.ts";
import { buildNote } from "@/federation/note.ts";
import { origin } from "@/config.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import * as followsRepo from "@/db/repositories/follows.ts";
import * as postsRepo from "@/db/repositories/posts.ts";

// Sends a Create(Note) for a local post to all remote followers' inboxes.
// Fedify handles HTTP signatures, batching and delivery retries.
export async function deliverPost(postId: string): Promise<void> {
  const row = await postsRepo.findById(postId);
  if (!row || row.post.remote) return;

  const author = await usersRepo.findById(row.post.authorId);
  if (!author) return;

  const remoteActors = await followsRepo.remoteFollowerActors(author.id);
  if (remoteActors.length === 0) return;

  const ctx = getFederation().createContext(new URL(origin), undefined);

  const recipients = [];
  for (const uri of remoteActors) {
    const actor = await ctx.lookupObject(uri);
    if (isActor(actor)) recipients.push(actor);
  }
  if (recipients.length === 0) return;

  await ctx.sendActivity(
    { identifier: author.username },
    recipients,
    new Create({
      id: new URL(`/posts/${row.post.id}/activity`, ctx.getActorUri(author.username)),
      actor: ctx.getActorUri(author.username),
      object: buildNote(ctx, author.username, row.post),
      tos: [PUBLIC_COLLECTION],
    }),
  );
}
