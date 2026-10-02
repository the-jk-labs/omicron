import { page } from "$app/state";
import MobileNav from "$lib/components/MobileNav.svelte";
import type { User } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";

const me = { id: "u1", username: "ada", displayName: "Ada" } as User;
const nav = () => screen.getByRole("navigation", { name: "Primary" });

afterEach(() => {
  page.url = new URL("http://localhost/") as typeof page.url;
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

function scrollTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
  window.dispatchEvent(new Event("scroll"));
}

test("five tabs, the current one marked as the page", () => {
  page.url = new URL("http://localhost/lists/abc") as typeof page.url;
  render(MobileNav, { props: { user: me } });
  expect(screen.getAllByRole("link").map((a) => a.textContent?.trim())).toEqual([
    "Home",
    "Lists",
    "Write",
    "Stats",
    "Profile",
  ]);
  expect(screen.getByRole("link", { name: "Lists" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/@ada");
});

test("retracts on scroll down past the top zone, returns on scroll up", async () => {
  render(MobileNav, { props: { user: me } });
  scrollTo(300);
  await Promise.resolve();
  expect(nav().getAttribute("style")).toContain("translateY(100%)");
  scrollTo(250);
  await Promise.resolve();
  expect(nav().getAttribute("style")).not.toContain("translateY(100%)");
});

test("small jitters and the top of the page never hide it", async () => {
  render(MobileNav, { props: { user: me } });
  scrollTo(3);
  await Promise.resolve();
  expect(nav().getAttribute("style")).not.toContain("translateY(100%)");
  scrollTo(60);
  await Promise.resolve();
  expect(nav().getAttribute("style")).not.toContain("translateY(100%)");
});

test("keyboard focus brings a retracted bar back", async () => {
  render(MobileNav, { props: { user: me } });
  scrollTo(400);
  await Promise.resolve();
  await fireEvent.focusIn(screen.getByRole("link", { name: "Home" }));
  expect(nav().getAttribute("style")).not.toContain("translateY(100%)");
});

test("another user's profile isn't announced as your Profile", () => {
  page.url = new URL("http://localhost/@adam") as typeof page.url;
  render(MobileNav, { props: { user: me } });
  expect(screen.getByRole("link", { name: "Profile" })).not.toHaveAttribute("aria-current");
});
