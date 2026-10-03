// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import EmojiTrigger from "#lib/components/EmojiTrigger.svelte";

vi.mock("emoji-picker-element", () => ({}));

const picker = () => document.querySelector<HTMLElement>("emoji-picker");

test("opens the picker, hands back the pick and closes", async () => {
  const onPick = vi.fn<(e: string) => void>();
  render(EmojiTrigger, { props: { onPick, label: "Insert emoji" } });
  expect(picker()).toBe(null);
  await fireEvent.click(screen.getByRole("button", { name: "Insert emoji" }));
  await waitFor(() => expect(picker()).not.toBe(null));
  picker()!.dispatchEvent(new CustomEvent("emoji-click", { detail: { unicode: "👍" } }));
  expect(onPick).toHaveBeenCalledWith("👍");
  await waitFor(() => expect(picker()).toBe(null));
});
