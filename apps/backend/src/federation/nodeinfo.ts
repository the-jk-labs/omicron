// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Federation } from "@fedify/fedify";
import { nodeInfo } from "@/services/nodeInfo.ts";

// Serves the instance's NodeInfo document at /nodeinfo/2.1.
//
// Registering the dispatcher is also what makes /.well-known/nodeinfo useful:
// Fedify answers that path unconditionally, but with an empty `links` array
// until there is a document to point at — a 200 that tells a directory nothing,
// which is exactly how an instance ends up federating correctly and still
// appearing in no listing anywhere.
//
// The document itself (what we claim, and why each field says what it says) is
// services/nodeInfo.ts; this file is only the ActivityPub-side wiring.
export function setupNodeInfo<T>(f: Federation<T>) {
  f.setNodeInfoDispatcher("/nodeinfo/2.1", () => nodeInfo());
}
