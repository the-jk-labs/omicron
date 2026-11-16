// SPDX-License-Identifier: AGPL-3.0-or-later
import { type Column, sql } from "drizzle-orm";
import { users } from "@/db/schema.ts";

// True unless `userId` names a soft-deleted account. A deleted account's rows are
// kept for its restore window, so every read that would lose them to the
// hard-delete cascade filters them here instead. Null (a remote author) passes.
export function notDeletedUser(userId: Column) {
  return sql`not exists (select 1 from ${users} where ${users.id} = ${userId} and ${users.deletedAt} is not null)`;
}

// Local accounts that are soft-deleted, for `x not in (...)` filters in raw SQL.
export const deletedUserIds = sql`(select ${users.id} from ${users} where ${users.deletedAt} is not null)`;
