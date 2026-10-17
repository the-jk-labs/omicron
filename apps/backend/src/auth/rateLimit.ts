// SPDX-License-Identifier: AGPL-3.0-or-later
import { hit } from "@/lib/rateLimitCore.ts";

export const authRateLimitStorage = {
  async consume(key: string, rule: { window: number; max: number }) {
    const { allowed, resetAt } = await hit(`auth:${key}`, rule.window * 1000, rule.max);
    return { allowed, retryAfter: allowed ? null : Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) };
  },
};
