// SPDX-License-Identifier: AGPL-3.0-or-later
import { type Column, sql } from "drizzle-orm";
import { users } from "@/db/schema.ts";

// True unless `userId` names a deleted or frozen account. A deleted account's rows are kept for its restore
// window, and a frozen one's are kept for unfreezing, so every read that would surface them filters them here.
// Null (a remote author) passes.
export function notHiddenUser(userId: Column) {
  return sql`not exists (select 1 from ${users} where ${users.id} = ${userId} and (${users.deletedAt} is not null or ${users.frozenAt} is not null))`;
}

// Local accounts that are deleted or frozen, for `x not in (...)` filters in raw SQL.
export const hiddenUserIds = sql`(select ${users.id} from ${users} where ${users.deletedAt} is not null or ${users.frozenAt} is not null)`;
