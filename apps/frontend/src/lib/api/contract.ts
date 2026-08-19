// SPDX-License-Identifier: AGPL-3.0-or-later
// Compile-time proof that `$lib/types` still matches what the backend sends.
//
// The types in `$lib/types` are hand-written on purpose: they carry the
// reader's half of the documentation (which field to link with, which is null
// when, which endpoint omits which), which a mechanically derived type cannot.
// The cost of writing them by hand is that they can drift from the backend's
// serializers without anything noticing until it breaks at runtime.
//
// This file removes that cost. It imports the backend's serializers as types
// only (through the `@` alias — see svelte.config.js) and asserts that every
// payload the backend produces is assignable to the type this app declares for
// it. Nothing imports this module; it exists to be typechecked. It emits no
// runtime code at all, so it never reaches the bundle.
//
// A serializer change that breaks a frontend type now fails `pnpm svelte-check`
// with the offending pair named, instead of shipping.
//
// ── direction of the assertion ──
// The check is one-way: backend payload → frontend type. That is deliberate,
// not a weakened equality check.
//   • backend changes a field's type      → fails ✔ (the frontend would misread it)
//   • backend stops sending a field       → fails ✔ (the frontend expects it)
//   • frontend declares a field never sent → fails ✔ (undefined at runtime)
//   • backend adds a field the UI ignores → passes ✔ (genuinely harmless)
// Requiring equality instead would flag that last case, which is normal and
// safe, and would break every frontend type that deliberately widens across
// several endpoints (`Post.status` is optional because `barePost` omits it).

import type {
  AdminUser,
  Comment,
  CoverCredit,
  Notification,
  Post,
  PostAuthor,
  ProfileLink,
  ReadingList,
  RecommendedBy,
  RelationActor,
  RemoteProfile,
  Tag,
  User,
  WebhookToken,
} from "$lib/types";
import type {
  adminUserView,
  commentView,
  notificationView,
  postWithAuthor,
  profileLinkView,
  publicUser,
  readingListView,
  RecommendedBy as BackendRecommendedBy,
  relationActorLocal,
  relationActorRemote,
  remoteProfile,
  TagSummary,
  webhookTokenView,
} from "@/routes/serializers.ts";

// What `c.json()` does to a serializer's return value on the way out: `Date`
// becomes an ISO string, everything else keeps its shape. Applied to the
// backend side of every assertion below so the two sides are compared as they
// actually meet — over the wire — rather than as they look in Deno's memory.
type Serialized<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Serialized<U>[]
    : T extends object
      ? { [K in keyof T]: Serialized<T[K]> }
      : T;

// Yields `true` when the backend payload fits the frontend type, and otherwise
// an object type naming both sides — which `Assert` then rejects, putting both
// in the compiler's error message.
type Fits<Payload, Declared> = Payload extends Declared
  ? true
  : {
      ERROR: "Backend payload no longer matches the type this app declares for it.";
      payload: Payload;
      declared: Declared;
    };

type Assert<T extends true> = T;

type Wire<F extends (...args: never[]) => unknown> = Serialized<ReturnType<F>>;

// ── assertions ──
// Each line reads: the payload this serializer produces fits the type the
// frontend declares for it.

type _Tag = Assert<Fits<Serialized<TagSummary>, Tag>>;
type _ProfileLink = Assert<Fits<Wire<typeof profileLinkView>, ProfileLink>>;
// Reached through `postWithAuthor` rather than imported from `@/lib/cover.ts`
// directly: that module imports `@/lib/http.ts`, which imports hono — a jsr
// specifier this app's resolver cannot see. Going through the serializer keeps
// the backend type graph reachable from here free of any runtime dependency.
type _CoverCredit = Assert<Fits<NonNullable<Wire<typeof postWithAuthor>["coverCredit"]>, CoverCredit>>;

type _User = Assert<Fits<Wire<typeof publicUser>, User>>;
type _AdminUser = Assert<Fits<Wire<typeof adminUserView>, AdminUser>>;

type _Post = Assert<Fits<Wire<typeof postWithAuthor>, Post>>;
type _PostAuthor = Assert<Fits<Wire<typeof postWithAuthor>["author"], PostAuthor>>;
type _RecommendedBy = Assert<Fits<Serialized<BackendRecommendedBy>, RecommendedBy>>;

type _Comment = Assert<Fits<Wire<typeof commentView>, Comment>>;
type _Notification = Assert<Fits<Wire<typeof notificationView>, Notification>>;
type _WebhookToken = Assert<Fits<Wire<typeof webhookTokenView>, WebhookToken>>;
type _ReadingList = Assert<Fits<Wire<typeof readingListView>, ReadingList>>;

type _RemoteProfile = Assert<Fits<Wire<typeof remoteProfile>, RemoteProfile>>;
type _RelationActorLocal = Assert<Fits<Wire<typeof relationActorLocal>, RelationActor>>;
type _RelationActorRemote = Assert<Fits<Wire<typeof relationActorRemote>, RelationActor>>;
