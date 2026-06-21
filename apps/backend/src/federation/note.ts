import type { Context } from "@fedify/fedify";
import { Note, PUBLIC_COLLECTION } from "@fedify/fedify/vocab";
import type { Post } from "@/db/schema.ts";

// Builds the ActivityPub Note for a local post. The note id is stable so the
// same post always federates with the same URI.
export function buildNote(ctx: Context<unknown>, identifier: string, post: Post): Note {
  return new Note({
    id: new URL(`/posts/${post.id}`, ctx.getActorUri(identifier)),
    attribution: ctx.getActorUri(identifier),
    content: post.contentHtml,
    to: PUBLIC_COLLECTION,
    cc: ctx.getFollowersUri(identifier),
    url: new URL(`/posts/${post.id}`, ctx.getActorUri(identifier)),
  });
}
