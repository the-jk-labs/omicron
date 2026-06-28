// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { authRoutes } from "@/routes/auth.ts";
import { postRoutes } from "@/routes/posts.ts";
import { feedRoutes } from "@/routes/feed.ts";
import { userRoutes } from "@/routes/users.ts";
import { mediaRoutes } from "@/routes/media.ts";
import { remoteRoutes } from "@/routes/remote.ts";
import { searchRoutes } from "@/routes/search.ts";
import { tagRoutes } from "@/routes/tags.ts";
import { listRoutes } from "@/routes/lists.ts";
import type { AppEnv } from "@/routes/types.ts";

// Mounts the JSON API under /api.
export const apiRoutes = new Hono<AppEnv>();

apiRoutes.route("/auth", authRoutes);
apiRoutes.route("/posts", postRoutes);
apiRoutes.route("/feed", feedRoutes);
apiRoutes.route("/users", userRoutes);
apiRoutes.route("/uploads", mediaRoutes);
apiRoutes.route("/remote", remoteRoutes);
apiRoutes.route("/search", searchRoutes);
apiRoutes.route("/tags", tagRoutes);
apiRoutes.route("/lists", listRoutes);
