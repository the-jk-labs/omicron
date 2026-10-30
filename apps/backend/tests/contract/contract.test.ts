// SPDX-License-Identifier: AGPL-3.0-or-later
// The backend's half of the API contract (packages/contract). The type assertions prove at compile time that each
// payload fits the schema the clients read it with, so a serializer change that breaks the contract fails this app's
// own `pnpm check`. The tests then parse real serializer output, as JSON, with those schemas.
//
// The check is one-way, payload → schema: a field the backend stops sending, or changes the type of, fails; a field
// it adds that no schema names passes (clients ignore it).
import * as contract from "@omicron/contract";
import { describe, expect, test } from "vitest";
import * as z from "zod/mini";
import {
  adminUserView,
  barePost,
  commentView,
  deletedUserView,
  postWithAuthor,
  privateUser,
  publicUser,
  remoteProfile,
} from "@/routes/serializers.ts";
import type {
  adminUserDetailView,
  notificationView,
  profileLinkView,
  readingListForPostView,
  readingListView,
  relationActorLocal,
  relationActorRemote,
  webhookTokenView,
} from "@/routes/serializers.ts";
import type { AccessRule, testAccessRules } from "@/services/accessRules.ts";
import type { DashboardSummary } from "@/services/analytics.ts";
import type { redactedConfig } from "@/services/emailSettings.ts";
import type { list as followRequests } from "@/services/followRequests.ts";
import type { followersOf } from "@/services/follows.ts";
import type { publicInfo } from "@/services/instanceSetup.ts";
import type { listBlockedDomains, listReports } from "@/services/moderation.ts";
import type { list as notificationPage } from "@/services/notifications.ts";
import type { connections } from "@/services/oauth.ts";
import type { ownCounts } from "@/services/posts.ts";
import type { listRelation } from "@/services/relations.ts";
import type { searchPeople, searchTags } from "@/services/search.ts";
import type { getSeoSettings } from "@/services/seo.ts";
import type { search as stockPhotos } from "@/services/stockPhotos.ts";
import type { getTag, listAliases, trending } from "@/services/tags.ts";
import type { getSettings as umamiSettings } from "@/services/umami.ts";
import type { suggestedFollows } from "@/services/users.ts";
import {
  commentWithAuthor,
  postRow,
  postWithAuthor as postRowWithAuthor,
  remoteActorRow,
  userRow,
} from "../fixtures.ts";

// What `c.json()` does on the way out: a Date becomes an ISO string, everything else keeps its shape.
type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

// `true` when the payload fits the schema's type; otherwise an object naming both sides, which `Assert` rejects so
// the compiler's message shows the pair.
type Fits<Payload, Schema extends z.ZodMiniType> =
  Serialized<Payload> extends z.output<Schema>
    ? true
    : {
        ERROR: "The backend payload no longer fits the contract";
        payload: Serialized<Payload>;
        schema: z.output<Schema>;
      };
type Assert<T extends true> = T;

type Out<F extends (...args: never[]) => unknown> = Awaited<ReturnType<F>>;
type Item<F extends (...args: never[]) => unknown> = Out<F> extends (infer U)[] ? U : never;

// ── serializers ──
type _User = Assert<Fits<Out<typeof publicUser>, typeof contract.User>>;
type _Me = Assert<Fits<Out<typeof privateUser>, typeof contract.Me>>;
type _ProfileLink = Assert<Fits<Out<typeof profileLinkView>, typeof contract.ProfileLink>>;
type _AdminUser = Assert<Fits<Out<typeof adminUserView>, typeof contract.AdminUser>>;
type _AdminUserDetail = Assert<Fits<Out<typeof adminUserDetailView>, typeof contract.AdminUserDetail>>;
type _DeletedUser = Assert<Fits<Out<typeof deletedUserView>, typeof contract.DeletedUser>>;
type _Post = Assert<Fits<Out<typeof postWithAuthor>, typeof contract.Post>>;
type _BarePost = Assert<Fits<Out<typeof barePost>, typeof contract.BarePost>>;
type _Comment = Assert<Fits<Out<typeof commentView>, typeof contract.Comment>>;
type _Notification = Assert<Fits<Out<typeof notificationView>, typeof contract.Notification>>;
type _WebhookToken = Assert<Fits<Out<typeof webhookTokenView>, typeof contract.WebhookToken>>;
type _ReadingList = Assert<Fits<Out<typeof readingListView>, typeof contract.ReadingList>>;
type _ReadingListForPost = Assert<Fits<Out<typeof readingListForPostView>, typeof contract.ReadingListForPost>>;
type _RemoteProfile = Assert<Fits<Out<typeof remoteProfile>, typeof contract.RemoteProfile>>;
type _RelationLocal = Assert<Fits<Out<typeof relationActorLocal>, typeof contract.RelationActor>>;
type _RelationRemote = Assert<Fits<Out<typeof relationActorRemote>, typeof contract.RelationActor>>;

// ── services whose results go out as they are ──
type _InstanceInfo = Assert<Fits<Out<typeof publicInfo>, typeof contract.InstanceInfo>>;
type _Dashboard = Assert<Fits<DashboardSummary, typeof contract.DashboardSummary>>;
type _OwnCounts = Assert<Fits<Out<typeof ownCounts>, typeof contract.OwnPostCounts>>;
type _NotificationPage = Assert<Fits<Out<typeof notificationPage>, typeof contract.NotificationPage>>;
type _FollowRequest = Assert<Fits<Item<typeof followRequests>, typeof contract.FollowRequest>>;
type _Followers = Assert<Fits<Item<typeof followersOf>, typeof contract.RelationActor>>;
type _Relations = Assert<Fits<Item<typeof listRelation>, typeof contract.RelationActor>>;
type _Suggested = Assert<Fits<Item<typeof suggestedFollows>, typeof contract.SuggestedUser>>;
type _SearchPeople = Assert<Fits<Item<typeof searchPeople>, typeof contract.RelationActor>>;
type _SearchTags = Assert<Fits<Item<typeof searchTags>, typeof contract.TagWithCount>>;
type _Trending = Assert<Fits<Item<typeof trending>, typeof contract.TagWithCount>>;
type _TagDetail = Assert<Fits<Out<typeof getTag>, typeof contract.TagDetail>>;
type _TagAliases = Assert<Fits<{ aliases: Out<typeof listAliases> }, typeof contract.TagAliases>>;
type _Report = Assert<Fits<Item<typeof listReports>, typeof contract.Report>>;
type _BlockedDomain = Assert<Fits<Item<typeof listBlockedDomains>, typeof contract.BlockedDomain>>;
type _ConnectedApp = Assert<Fits<Item<typeof connections>, typeof contract.ConnectedApp>>;
type _StockPhoto = Assert<Fits<Item<typeof stockPhotos>, typeof contract.StockPhoto>>;
type _AccessRule = Assert<Fits<AccessRule, typeof contract.AccessRule>>;
type _AccessRuleTest = Assert<Fits<Out<typeof testAccessRules>, typeof contract.AccessRuleTest>>;
type _Umami = Assert<Fits<Out<typeof umamiSettings>, typeof contract.UmamiSettings>>;
type _Seo = Assert<Fits<Out<typeof getSeoSettings>, typeof contract.AdminSeoSettings>>;
type _EmailSettings = Assert<Fits<Out<typeof redactedConfig>, typeof contract.EmailSettings>>;

/** The payload as a client receives it: through JSON, then the schema, failing on any mismatch. */
const overTheWire = <S extends z.ZodMiniType>(schema: S, payload: unknown) =>
  z.parse(schema, JSON.parse(JSON.stringify(payload)));

describe("the contract, at runtime", () => {
  test("a local post and a remote one parse as Post", () => {
    const engagement = {
      likeCount: 1,
      liked: true,
      commentCount: 2,
      recommendCount: 0,
      recommended: false,
      saved: true,
    };
    const local = overTheWire(
      contract.Post,
      postWithAuthor(postRowWithAuthor({ id: "p1" }), engagement, [{ slug: "deno", name: "Deno" }]),
    );
    expect(local).toMatchObject({ id: "p1", saved: true, author: { remote: false }, recommendedBy: null });
    const remote = {
      post: { ...postRow({ id: "p2", remote: true }), authorId: null, remoteActorId: "a1" },
      localAuthor: null,
      remoteActor: remoteActorRow({ id: "a1" }),
    };
    expect(overTheWire(contract.Post, postWithAuthor(remote as never)).author.remote).toBe(true);
  });

  test("a saved post's answer parses as BarePost", () => {
    expect(overTheWire(contract.SavedPostResponse, { post: barePost(postRow({ id: "p1" })) }).post.id).toBe("p1");
  });

  test("comments, local and remote, parse with their replies", () => {
    const top = { ...commentWithAuthor({ id: "c1" }), replies: [commentWithAuthor({ id: "c2", parentId: "c1" })] };
    const parsed = overTheWire(contract.CommentPage, { items: [commentView(top)], nextCursor: null });
    expect(parsed.items[0]).toMatchObject({ id: "c1", author: { remote: false }, replies: [{ id: "c2" }] });
  });

  test("the account's own record and a public profile parse", () => {
    expect(overTheWire(contract.MeResponse, { user: privateUser(userRow()) }).user?.email).toBe("ada@example.test");
    const profile = {
      user: publicUser(userRow(), [], [], { locked: false }),
      counts: { followers: 1, following: 2 },
      followState: "none",
      isFollowing: false,
      isMuted: false,
      isBlocked: false,
      locked: false,
    };
    expect(overTheWire(contract.Profile, profile).user.username).toBe("ada");
    expect(overTheWire(contract.RemoteProfile, remoteProfile(remoteActorRow())).user.remote).toBe(true);
  });

  test("admin views parse", () => {
    expect(overTheWire(contract.AdminUserResponse, { user: adminUserView(userRow()) }).user.suspended).toBe(false);
    const deleted = deletedUserView({
      user: userRow({ deletedAt: new Date(0) }),
      deletedByUsername: null,
      postCount: 3,
      expiresAt: new Date(1),
    });
    expect(overTheWire(contract.DeletedUser, deleted).postCount).toBe(3);
  });

  test("a schema rejects a payload missing a field it requires", () => {
    const { saved: _gone, ...older } = postWithAuthor(postRowWithAuthor());
    expect(() => overTheWire(contract.Post, older)).toThrow(/saved/);
  });
});
