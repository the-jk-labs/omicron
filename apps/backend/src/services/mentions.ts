// SPDX-License-Identifier: AGPL-3.0-or-later
import type { PostWithAuthor } from "@/db/repositories/posts.ts";
import * as relationsRepo from "@/db/repositories/relations.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import { federationOrigin } from "@/services/federationState.ts";
import * as notifications from "@/services/notifications.ts";
import { assertVisible } from "@/services/posts.ts";

// @mentions in plain-text comments. `@ada` names a local account, `@ada@host`
// one on `host` — this instance's own host counts as local. Only local accounts
// can be notified; the rest stay plain text (clients still link them).

// Caps the notifications a single comment can send, so one comment can't page the whole instance.
export const MAX_MENTIONS = 10;

// Same boundary rule as the clients: not inside a word, an email address or another handle.
const MENTION_RE = /(?<![\w@.])@([a-z0-9_]{1,30})(?:@([a-z0-9-]+(?:\.[a-z0-9-]+)+))?(?![\w@])/gi;

// The distinct local usernames a text mentions, lower-cased, in order of first appearance.
export function parseLocalMentions(text: string, localHost: string): string[] {
  const host = localHost.toLowerCase();
  const names = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    const domain = match[2]?.toLowerCase();
    if (domain && domain !== host) continue;
    names.add(match[1].toLowerCase());
    if (names.size === MAX_MENTIONS) break;
  }
  return [...names];
}

type MentionParams = {
  text: string;
  post: PostWithAuthor;
  commentId: string;
  // Exactly one of the two: who wrote the comment.
  actorId?: string | null;
  remoteActorId?: string | null;
  // Already notified for this comment (post author, replied-to author): one alert is enough.
  skip?: (string | null | undefined)[];
};

// Sends a "mention" notification to every local account the comment names and
// that can see the post. Best-effort, like notify(): it never fails the write.
export async function notifyMentions(params: MentionParams): Promise<void> {
  try {
    const names = parseLocalMentions(params.text, new URL(federationOrigin()).host);
    if (names.length === 0) return;
    const skip = new Set(params.skip?.filter(Boolean));
    const recipients = await usersRepo.findActiveByUsernames(names);
    for (const recipient of recipients) {
      if (skip.has(recipient.id) || recipient.id === params.actorId) continue;
      if (!(await mayNotify(recipient.id, params))) continue;
      await notifications.notify({
        recipientId: recipient.id,
        type: "mention",
        actorId: params.actorId ?? null,
        remoteActorId: params.remoteActorId ?? null,
        postId: params.post.post.id,
        commentId: params.commentId,
      });
    }
  } catch (err) {
    console.error("mentions: failed to notify", err);
  }
}

// A block either way silences the mention, and nobody hears about a post they can't open.
async function mayNotify(recipientId: string, params: MentionParams): Promise<boolean> {
  const blocked = params.actorId
    ? await relationsRepo.localBlockExists(recipientId, params.actorId)
    : params.remoteActorId
      ? await relationsRepo.hasRemote("block", recipientId, params.remoteActorId)
      : false;
  if (blocked) return false;
  return assertVisible(params.post, recipientId).then(
    () => true,
    () => false,
  );
}
