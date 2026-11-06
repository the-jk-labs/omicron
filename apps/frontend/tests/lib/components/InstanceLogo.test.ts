// SPDX-License-Identifier: AGPL-3.0-or-later
import { page } from "$app/state";
import { render } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";
import builtIn from "#lib/assets/omicron.svg";
import InstanceLogo from "#lib/components/InstanceLogo.svelte";

const image = () => document.querySelector("img")!;

afterEach(() => {
  Object.assign(page.data, { instance: undefined });
});

test("uses the built-in logo until an admin sets one", () => {
  render(InstanceLogo);
  expect(image().getAttribute("src")).toBe(builtIn);
});

test("uses the admin's logo, as decoration beside the instance's name", () => {
  Object.assign(page.data, { instance: { logoUrl: "/api/uploads/mine.webp" } });
  render(InstanceLogo, { props: { class: "h-7" } });
  expect(image().getAttribute("src")).toBe("/api/uploads/mine.webp");
  expect(image().getAttribute("alt")).toBe("");
  expect(image()).toHaveClass("h-7");
});
