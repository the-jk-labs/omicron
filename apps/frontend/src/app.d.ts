// SPDX-License-Identifier: AGPL-3.0-or-later
import type { User } from "$lib/types";

declare global {
  namespace App {
    interface Locals {
      user: User | null;
      // BCP-47 subtag for the <html lang> of this response. A page whose main
      // content has a known language sets it during load; hooks.server.ts reads
      // it back when substituting the app.html placeholder. Unset means "en".
      lang?: string | null;
    }
    interface PageData {
      user?: User | null;
      // The reader's IANA timezone, from their cookie — see $lib/timezone.
      timeZone?: string | null;
    }
  }
}
