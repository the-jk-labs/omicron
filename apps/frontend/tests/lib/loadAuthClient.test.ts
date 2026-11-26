// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test, vi } from "vitest";

// The mock factory runs when something first imports the client, so it counts
// whether a module pulled it in up front.
const loaded = vi.hoisted(() => ({ count: 0 }));
vi.mock("#lib/auth-client.js", () => {
  loaded.count++;
  return { authClient: { signOut: vi.fn<() => Promise<void>>() } };
});

// The nav and the passkey offer are on every page; importing them used to put
// the ~16 KB Better Auth client in every reader's download.
test("the modules on every page don't load the auth client until it's used", async () => {
  await import("#lib/components/Nav.svelte");
  await import("#lib/components/PasskeyPrompt.svelte");
  await import("#lib/passkeys.js");
  expect(loaded.count).toBe(0);

  const { loadAuthClient } = await import("#lib/loadAuthClient.js");
  const client = await loadAuthClient();
  expect(loaded.count).toBe(1);
  expect(client).toHaveProperty("signOut");
  expect(await loadAuthClient()).toBe(client);
});
