// SPDX-License-Identifier: AGPL-3.0-or-later
import { render } from "@testing-library/svelte";
import { expect, test } from "vitest";
import UsernameHint from "#lib/components/UsernameHint.svelte";

test("names the saved login for password managers, out of sight and out of the tab order", () => {
  render(UsernameHint, { props: { username: "ada" } });
  const input = document.querySelector<HTMLInputElement>('input[autocomplete="username"]')!;
  expect(input).toHaveValue("ada");
  expect(input).toHaveAttribute("readonly");
  expect(input).toHaveAttribute("tabindex", "-1");
  expect(input).toHaveAttribute("aria-hidden", "true");
});
