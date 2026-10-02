import { confirm, confirmRequest } from "$lib/components/ui/confirm";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { get } from "svelte/store";
import { expect, test } from "vitest";

test("a confirm publishes its request and resolves with the dialog's answer", async () => {
  const pending = confirm({ description: "Delete?", destructive: true, notify: { label: "Tell them" } });
  const request = get(confirmRequest);
  expect(request).toMatchObject({ description: "Delete?", destructive: true, notify: { label: "Tell them" } });
  request!.resolve({ ok: true, notify: true });
  expect(await pending).toEqual({ ok: true, notify: true });
});

test("a newer confirm replaces the pending request", () => {
  void confirm({ description: "First" });
  void confirm({ description: "Second" });
  expect(get(confirmRequest)?.description).toBe("Second");
});
