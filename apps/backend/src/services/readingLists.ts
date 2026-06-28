// SPDX-License-Identifier: AGPL-3.0-or-later
import * as listsRepo from "@/db/repositories/readingLists.ts";
import * as postsRepo from "@/db/repositories/posts.ts";
import * as usersRepo from "@/db/repositories/users.ts";
import type { ReadingList } from "@/db/schema.ts";
import { type Cursor, DEFAULT_PAGE_SIZE, encodeCursor } from "@/lib/pagination.ts";
import { badRequest, forbidden, notFound } from "@/lib/http.ts";
import { queue } from "@/queue/queue.ts";

// Business logic for reading lists. Ownership and visibility are enforced here;
// routes stay thin. The "Read later" list is a normal list flagged
// `isReadLater` — created lazily, private by default, and protected from
// renaming/deletion (the only thing the owner can change is its visibility).

const MAX_TITLE_LEN = 100;
const MAX_DESCRIPTION_LEN = 500;

export type ListWithCount = ReadingList & { itemCount: number };

function normalizeVisibility(v: unknown): "public" | "private" {
  return v === "private" ? "private" : "public";
}

// Attaches item counts to a batch of lists in one query.
async function withCounts(lists: ReadingList[]): Promise<ListWithCount[]> {
  const counts = await listsRepo.itemCountsFor(lists.map((l) => l.id));
  return lists.map((l) => ({ ...l, itemCount: counts.get(l.id) ?? 0 }));
}

// The signed-in user's own lists (all visibilities), read-later guaranteed to
// exist (created lazily here so the list is always present in the UI).
export async function myLists(userId: string): Promise<ListWithCount[]> {
  await listsRepo.ensureReadLater(userId);
  return withCounts(await listsRepo.listForUser(userId, false));
}

// A named user's lists for their profile. The owner sees everything; everyone
// else sees only public lists.
export async function listsForProfile(
  username: string,
  viewerId: string | null,
): Promise<ListWithCount[]> {
  const owner = await usersRepo.findByUsername(username);
  if (!owner) throw notFound("User not found.");
  const isOwner = viewerId === owner.id;
  if (isOwner) await listsRepo.ensureReadLater(owner.id);
  return withCounts(await listsRepo.listForUser(owner.id, !isOwner));
}

export async function readLater(userId: string): Promise<ListWithCount> {
  const list = await listsRepo.ensureReadLater(userId);
  const [withCount] = await withCounts([list]);
  return withCount;
}

export async function createList(
  userId: string,
  input: { title?: string; description?: string; visibility?: string },
): Promise<ListWithCount> {
  const title = input.title?.trim();
  if (!title) throw badRequest("A list needs a title.");
  if (title.length > MAX_TITLE_LEN) {
    throw badRequest(`Title must be at most ${MAX_TITLE_LEN} characters.`);
  }
  const description = (input.description ?? "").trim();
  if (description.length > MAX_DESCRIPTION_LEN) {
    throw badRequest(`Description must be at most ${MAX_DESCRIPTION_LEN} characters.`);
  }
  const list = await listsRepo.create({
    userId,
    title,
    description,
    visibility: normalizeVisibility(input.visibility),
  });
  return { ...list, itemCount: 0 };
}

// Loads a list and asserts the viewer may see it (public, or owned by viewer).
async function readableList(listId: string, viewerId: string | null): Promise<ReadingList> {
  const list = await listsRepo.findById(listId);
  if (!list) throw notFound("List not found.");
  if (list.visibility === "private" && list.userId !== viewerId) {
    // Don't reveal that a private list exists.
    throw notFound("List not found.");
  }
  return list;
}

// Loads a list and asserts the viewer owns it (mutations).
async function ownedList(listId: string, userId: string): Promise<ReadingList> {
  const list = await listsRepo.findById(listId);
  if (!list) throw notFound("List not found.");
  if (list.userId !== userId) throw forbidden("This list isn't yours.");
  return list;
}

export async function getList(
  listId: string,
  viewerId: string | null,
): Promise<
  { list: ListWithCount; isOwner: boolean; owner: { username: string; displayName: string } }
> {
  const list = await readableList(listId, viewerId);
  const [withCount] = await withCounts([list]);
  const owner = await usersRepo.findById(list.userId);
  return {
    list: withCount,
    isOwner: list.userId === viewerId,
    owner: { username: owner?.username ?? "", displayName: owner?.displayName ?? "" },
  };
}

export async function listItems(listId: string, viewerId: string | null, cursor: Cursor | null) {
  // `listId` may be a short id-prefix from a canonical URL; resolve to the full
  // row first, then query items by its real UUID.
  const list = await readableList(listId, viewerId);
  const rows = await listsRepo.listItems(list.id, cursor, DEFAULT_PAGE_SIZE);
  const hasMore = rows.length > DEFAULT_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, DEFAULT_PAGE_SIZE) : rows;
  const last = items.at(-1);
  const nextCursor = hasMore && last
    ? encodeCursor({ createdAt: last.itemCreatedAt.toISOString(), id: last.itemId })
    : null;
  // Hand back plain PostWithAuthor rows; the route enriches them like any feed.
  return { items: items as postsRepo.PostWithAuthor[], nextCursor };
}

export async function updateList(
  userId: string,
  listId: string,
  input: { title?: string; description?: string; visibility?: string },
): Promise<ListWithCount> {
  const list = await ownedList(listId, userId);
  const patch: { title?: string; description?: string; visibility?: "public" | "private" } = {};

  if (input.title !== undefined) {
    // The read-later list keeps its name; only its visibility is editable.
    if (list.isReadLater) throw badRequest("The Read later list can't be renamed.");
    const title = input.title.trim();
    if (!title) throw badRequest("A list needs a title.");
    if (title.length > MAX_TITLE_LEN) {
      throw badRequest(`Title must be at most ${MAX_TITLE_LEN} characters.`);
    }
    patch.title = title;
  }
  if (input.description !== undefined) {
    const description = input.description.trim();
    if (description.length > MAX_DESCRIPTION_LEN) {
      throw badRequest(`Description must be at most ${MAX_DESCRIPTION_LEN} characters.`);
    }
    patch.description = description;
  }
  if (input.visibility !== undefined) patch.visibility = normalizeVisibility(input.visibility);

  const updated = Object.keys(patch).length ? await listsRepo.update(list.id, patch) : list;
  const [withCount] = await withCounts([updated]);
  return withCount;
}

export async function deleteList(userId: string, listId: string): Promise<void> {
  const list = await ownedList(listId, userId);
  // The read-later list is a fixture, like YouTube's Watch Later — not deletable.
  if (list.isReadLater) throw badRequest("The Read later list can't be deleted.");
  await listsRepo.remove(list.id);
}

export async function addItem(userId: string, listId: string, postId: string): Promise<void> {
  const list = await ownedList(listId, userId);
  if (!(await postsRepo.findById(postId))) throw notFound("Post not found.");
  await listsRepo.addItem(list.id, postId);
  // Public lists federate an Add to the owner's remote followers; private and
  // Read-later-while-private lists stay local.
  if (list.visibility === "public") {
    queue.add("federate_list_item", { listId: list.id, postId, action: "add" });
  }
}

export async function removeItem(userId: string, listId: string, postId: string): Promise<void> {
  const list = await ownedList(listId, userId);
  await listsRepo.removeItem(list.id, postId);
  if (list.visibility === "public") {
    queue.add("federate_list_item", { listId: list.id, postId, action: "remove" });
  }
}

// The save-menu payload: every list the user owns, each flagged with whether it
// already contains the post. Read-later is created lazily so it's always shown.
export async function listsForPost(
  userId: string,
  postId: string,
): Promise<(ListWithCount & { contains: boolean })[]> {
  await listsRepo.ensureReadLater(userId);
  const lists = await listsRepo.listForUser(userId, false);
  const containing = await listsRepo.listIdsContaining(lists.map((l) => l.id), postId);
  const withCount = await withCounts(lists);
  return withCount.map((l) => ({ ...l, contains: containing.has(l.id) }));
}
