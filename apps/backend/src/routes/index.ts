// SPDX-License-Identifier: AGPL-3.0-or-later
import { Hono } from "hono";
import { adminRoutes } from "@/routes/admin.ts";
import { dashboardRoutes } from "@/routes/dashboard.ts";
import { feedRoutes } from "@/routes/feed.ts";
import { listRoutes } from "@/routes/lists.ts";
import { meRoutes } from "@/routes/me.ts";
import { mediaRoutes } from "@/routes/media.ts";
import { notificationRoutes } from "@/routes/notifications.ts";
import { ogRoutes } from "@/routes/og.ts";
import { photoRoutes } from "@/routes/photos.ts";
import { postRoutes } from "@/routes/posts.ts";
import { remoteRoutes } from "@/routes/remote.ts";
import { reportRoutes } from "@/routes/reports.ts";
import { searchRoutes } from "@/routes/search.ts";
import { seoRoutes } from "@/routes/seo.ts";
import { instanceRoutes, setupRoutes } from "@/routes/setup.ts";
import { tagRoutes } from "@/routes/tags.ts";
import type { AppEnv } from "@/routes/types.ts";
import { userRoutes } from "@/routes/users.ts";
import { webhookRoutes } from "@/routes/webhooks.ts";

// Mounts the JSON API under /api.
export const apiRoutes = new Hono<AppEnv>();

apiRoutes.route("/me", meRoutes);
apiRoutes.route("/posts", postRoutes);
apiRoutes.route("/og", ogRoutes);
apiRoutes.route("/feed", feedRoutes);
apiRoutes.route("/users", userRoutes);
apiRoutes.route("/uploads", mediaRoutes);
apiRoutes.route("/remote", remoteRoutes);
apiRoutes.route("/search", searchRoutes);
apiRoutes.route("/tags", tagRoutes);
apiRoutes.route("/lists", listRoutes);
apiRoutes.route("/dashboard", dashboardRoutes);
apiRoutes.route("/admin", adminRoutes);
apiRoutes.route("/reports", reportRoutes);
apiRoutes.route("/notifications", notificationRoutes);
apiRoutes.route("/instance", instanceRoutes);
apiRoutes.route("/setup", setupRoutes);
apiRoutes.route("/seo", seoRoutes);
apiRoutes.route("/photos", photoRoutes);
apiRoutes.route("/webhooks", webhookRoutes);
