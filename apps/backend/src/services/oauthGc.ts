// SPDX-License-Identifier: AGPL-3.0-or-later
import * as oauthRepo from "@/db/repositories/oauth.ts";

let started = false;
export async function sweep() {
  try {
    await oauthRepo.cleanup();
  } catch {
    console.error("oauth-gc: cleanup failed; the next sweep will retry.");
  }
}

export function startOAuthSweeper() {
  if (started) return;
  started = true;
  void sweep();
  setInterval(() => void sweep(), 3600_000);
}
