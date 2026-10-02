import LanguageSelect from "$lib/components/LanguageSelect.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

test("the trigger names the chosen language, or prompts for one", () => {
  const { unmount } = render(LanguageSelect, { props: { value: "az" } });
  expect(screen.getByRole("button", { name: "Article language" })).toHaveTextContent("Azerbaijani");
  unmount();
  render(LanguageSelect, { props: { value: null } });
  expect(screen.getByRole("button", { name: "Article language" })).toHaveTextContent("Language");
});

test("an unlisted federated code still shows as its code", () => {
  render(LanguageSelect, { props: { value: "tlh" } });
  expect(screen.getByRole("button", { name: "Article language" })).toHaveTextContent("TLH");
});

async function choose(name: RegExp) {
  await fireEvent.keyDown(screen.getByRole("button", { name: "Article language" }), { key: "Enter" });
  const option = await screen.findByRole("option", { name });
  // bits-ui Select picks on pointer-up, not click.
  await fireEvent.pointerDown(option, { pointerType: "mouse", button: 0 });
  await fireEvent.pointerUp(option, { pointerType: "mouse", button: 0 });
}

const trigger = () => screen.getByRole("button", { name: "Article language" });

test("choosing a language sets it; No language clears it", async () => {
  render(LanguageSelect, { props: { value: null } });
  await choose(/^German/);
  expect(trigger()).toHaveTextContent("German");
  await choose(/^No language/);
  expect(trigger()).toHaveTextContent("Language");
});
