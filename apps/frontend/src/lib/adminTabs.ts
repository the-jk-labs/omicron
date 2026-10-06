// SPDX-License-Identifier: AGPL-3.0-or-later
import type { IconName } from "#lib/components/Icon.svelte";

// The admin page's tabs. The open one lives in ?tab= so the server loads its data
// and a reload stays on it.
export const ADMIN_TABS = [
  { value: "reports", label: "Reports", icon: "flag" },
  { value: "users", label: "Users", icon: "users" },
  { value: "federation", label: "Federation", icon: "globe" },
  { value: "email", label: "Email", icon: "mail" },
  { value: "security", label: "Security", icon: "lock" },
  { value: "discoverability", label: "Discoverability", icon: "globe" },
  { value: "media", label: "Media", icon: "image" },
  { value: "settings", label: "Instance", icon: "settings" },
] as const satisfies readonly { value: string; label: string; icon: IconName }[];

export type AdminTab = (typeof ADMIN_TABS)[number]["value"];

export const asAdminTab = (v: string | null | undefined): AdminTab =>
  ADMIN_TABS.find((t) => t.value === v)?.value ?? "reports";

/** Moderators may use only these; the rest need the admin role. */
export const MODERATOR_TABS: readonly AdminTab[] = ["reports", "users"];
