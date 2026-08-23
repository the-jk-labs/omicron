// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ActorKeyPair as FedifyActorKeyPair, Context } from "@fedify/fedify";
import { Endpoints, Hashtag, Image, OrderedCollection, Person, PropertyValue } from "@fedify/fedify/vocab";
import { origin } from "@/config.ts";
import * as linksRepo from "@/db/repositories/profileLinks.ts";
import * as listsRepo from "@/db/repositories/readingLists.ts";
import type { TagSummary } from "@/db/repositories/tags.ts";
import type { User } from "@/db/schema.ts";
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
    ...(user.publicEmail ? [new PropertyValue({ name: "Email", value: escapeHtml(user.publicEmail) })] : []),
    ...links.map((l) => {
      // Custom links use the user's own label as the field name; known
      // platforms use their canonical label ("GitHub", "Mastodon", …).
      const name = l.platform === "custom" ? l.label || "Link" : linkLabel(l.platform);
      return new PropertyValue({
        name,
        value: `<a href="${escapeHtml(
          l.url,
        )}" target="_blank" rel="nofollow noopener noreferrer me" translate="no">${escapeHtml(
          linkDisplayText(l.url),
        )}</a>`,
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
    // Private accounts vet followers: remote instances show a "request to
    // follow" (locked) actor and withhold the auto-follow, matching the local
    // approval flow. Public accounts advertise instant follows (false).
    manuallyApprovesFollowers: user.isPrivate,
    endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
    // Where a *person* goes, which is not where the actor document lives.
    //
    // `id` above is the ActivityPub identity (/users/<name>) and is served as
    // JSON-LD only — Fedify answers a browser's Accept header there with 406.
    // This field is the one Mastodon renders as the profile link and the one
    // WebFinger republishes as `rel="profile-page"`, so pointing it at the actor
    // document meant every route a human could take from another instance to
    // this author's profile ended at "Not Acceptable". The reading page is the
    // answer, and it negotiates back to this actor for anything that asks for
    // JSON-LD (see the frontend's hooks.server.ts). Same split Mastodon draws
    // between /users/<name> and /@<name>.
    url: new URL(`/@${identifier}`, origin),
    icon: user.avatarUrl ? new Image({ url: new URL(user.avatarUrl, origin) }) : undefined,
    publicKey: keys[0]?.cryptographicKey,
    assertionMethods: keys.map((k) => k.multikey),
    // Profile tags, federated as Hashtags (like Mastodon's featured tags).
    tags: tags.map((t) => new Hashtag({ name: `#${t.name}`, href: new URL(`/tags/${t.slug}`, origin) })),
    streams: publicLists.map((l) => ctx.getObjectUri(OrderedCollection, { identifier, listId: l.id })),
    attachments,
  });
}
