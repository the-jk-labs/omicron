// SPDX-License-Identifier: AGPL-3.0-or-later
import type { User } from "$lib/types";

declare global {
  namespace App {
    interface Locals {
      user: User | null;
    }
    interface PageData {
      user?: User | null;
      // The reader's IANA timezone, from their cookie — see $lib/timezone.
      timeZone?: string | null;
    }
  }
}

export {};