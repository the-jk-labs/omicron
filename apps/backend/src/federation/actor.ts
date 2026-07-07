// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ActorKeyPair as FedifyActorKeyPair, Context } from "@fedify/fedify";
import {
  Endpoints,
  Hashtag,
  Image,
  OrderedCollection,
  Person,
  PropertyValue,
} from "@fedify/fedify/vocab";
import { origin } from "@/config.ts";
import type { User } from "@/db/schema.ts";
import * as linksRepo from "@/db/repositories/profileLinks.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import type { TagSummary } from "@/db/repositories/tags.ts";
import { escapeHtml } from "@/lib/html.ts";
import { linkDisplayText, linkLabel } from "@/lib/profileLinks.ts";

// Builds the ActivityPub Person for a local user. Shared by the actor
// dispatcher (mod.ts, serving GET /users/{id}) and the outbound Update sender
// (deliver.ts, fired on profile edits) so both always describe the actor
// identically.
export async function buildPerson(
  ctx: Context<unknown>,
  identifier: string,
  user: User,
  tags: TagSummary[],
  keys: FedifyActorKeyPair[],
): Promise<Person> {
  const publicLists = await listsRepo.listForUser(user.id, true);
  // Profile metadata fields, rendered by Mastodon et al. as the actor's
  // PropertyValue table. Each link's value carries `rel="me"` so that, when
  // the linked site links back the same way, Mastodon shows the green ✓
  // verified badge. An optional public email is exposed as a plain field.
  const links = await linksRepo.listForUser(user.id);
  const attachments = [
    ...(user.publicEmail
      ? [new PropertyValue({ name: "Email", value: escapeHtml(user.publicEmail) })]
      : []),
    ...links.map((l) => {
      // Custom links use the user's own label as the field name; known
      // platforms use their canonical label ("GitHub", "Mastodon", …).
      const name = l.platform === "custom" ? (l.label || "Link") : linkLabel(l.platform);
      return new PropertyValue({
        name,
        value: `<a href="${
          escapeHtml(l.url)
        }" target="_blank" rel="nofollow noopener noreferrer me" translate="no">${
          escapeHtml(linkDisplayText(l.url))
        }</a>`,
      });
    }),
  ];
  return new Person({
    id: ctx.getActorUri(identifier),
    preferredUsername: identifier,
    name: user.displayName,
    summary: user.bio,
    inbox: ctx.getInboxUri(identifier),
    outbox: ctx.getOutboxUri(identifier),
    followers: ctx.getFollowersUri(identifier),
    endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
    url: ctx.getActorUri(identifier),
    icon: user.avatarUrl ? new Image({ url: new URL(user.avatarUrl, origin) }) : undefined,
    publicKey: keys[0]?.cryptographicKey,
    assertionMethods: keys.map((k) => k.multikey),
    // Profile tags, federated as Hashtags (like Mastodon's featured tags).
    tags: tags.map((t) =>
      new Hashtag({ name: `#${t.name}`, href: new URL(`/tags/${t.slug}`, origin) })
    ),
    streams: publicLists.map((l) =>
      ctx.getObjectUri(OrderedCollection, { identifier, listId: l.id })
    ),
    attachments,
  });
}
