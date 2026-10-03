// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { createRawSnippet } from "svelte";
import { expect, test } from "vitest";
import Button from "#lib/components/ui/Button.svelte";

const children = createRawSnippet(() => ({ render: () => "<span>Go</span>" }));

test("defaults to a ghost button with the base sizing", () => {
  render(Button, { props: { children } });
  const btn = screen.getByRole("button", { name: "Go" });
  expect(btn.className).toContain("h-10 px-4");
  expect(btn.className.split(/\s+/)).toContain("inline-flex");
});

test("variants and sizes; icon, link and plain skip the base sizing", () => {
  const solid = render(Button, { props: { children, variant: "solid", size: "xs" } }).getByRole("button");
  expect(solid.className).toContain("h-8 px-2");
  expect(solid.className).toContain("bg-dark");
  solid.remove();
  const link = render(Button, { props: { children, variant: "link" } }).getByRole("button");
  expect(link.className).not.toContain("h-10");
});

test("a caller's display utility replaces the built-in inline-flex", () => {
  render(Button, { props: { children, class: "hidden md:flex" } });
  const btn = screen.getByRole("button", { hidden: true });
  expect(btn.className.split(/\s+/)).not.toContain("inline-flex");
  expect(btn.className).toContain("hidden");
});

test("an href renders a link; extra props pass through", () => {
  render(Button, { props: { children, href: "/login", "aria-label": "Sign in" } as never });
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
});
