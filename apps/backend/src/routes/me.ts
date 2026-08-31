// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import * as tagsRepo from "@/db/repositories/tags.ts";
import { profileLinkView, privateUser } from "@/routes/serializers.ts";
import type { AppEnv } from "@/routes/types.ts";
import * as usersService from "@/services/users.ts";

export const meRoutes = new Hono<AppEnv>();

// The signed-in user's full profile (tags + links), or null. Better Auth owns
// authentication; this is the app's rich self-view used to hydrate the client.
meRoutes.get("/", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ user: null });
  const [tags, links] = await Promise.all([tagsRepo.tagsForUser(user.id), usersService.profileLinks(user.id)]);
  return c.json({ user: privateUser(user, tags, links.map(profileLinkView)) });
});
