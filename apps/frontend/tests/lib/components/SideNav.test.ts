import { page } from "$app/state";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";
import SideNav from "#lib/components/SideNav.svelte";
import type { User } from "#lib/types.js";

const me = { id: "u1", username: "ada", displayName: "Ada", isAdmin: false, isModerator: false } as User;

afterEach(() => {
  page.url = new URL("http://localhost/");
});

function at(path: string) {
  page.url = new URL(`http://localhost${path}`);
}
const navLinks = () =>
  Array.from(document.querySelectorAll("nav > a, nav > div > a")).map((a) => a.textContent?.trim());
const isActive = (name: string) => screen.getByRole("link", { name }).classList.contains("bg-muted");

test("a guest gets Home and a join card naming the instance", () => {
  render(SideNav, {
    props: {
      user: null,
      appName: "Starlog",
      instance: { domain: "blog.example", federationEnabled: true, bannerText: null, bannerImageUrl: null } as never,
    },
  });
  expect(navLinks()).toEqual(["Home"]);
  expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/register");
  expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  expect(screen.getByText("blog.example")).toBeInTheDocument();
  expect(screen.getByText("An independent Starlog instance in the fediverse.")).toBeInTheDocument();
  expect(screen.getByText("On the fediverse")).toBeInTheDocument();
});

test("the join card uses the admin's banner text and image when set", () => {
  render(SideNav, {
    props: {
      user: null,
      instance: {
        domain: "",
        bannerText: "Writers welcome",
        bannerImageUrl: "/api/uploads/b.webp",
        federationEnabled: false,
      } as never,
    },
  });
  expect(screen.getByText("Writers welcome")).toBeInTheDocument();
  expect(document.querySelector('img[src="/api/uploads/b.webp"]')).not.toBe(null);
  expect(screen.queryByText("On the fediverse")).toBe(null);
});

test("a signed-in reader gets the full rail, Settings pinned at the bottom", () => {
  render(SideNav, { props: { user: me } });
  expect(navLinks()).toEqual(["Home", "Profile", "Lists", "Write", "Your posts", "Dashboard", "Settings"]);
  expect(screen.getByRole("link", { name: "Profile" })).toHaveAttribute("href", "/@ada");
});

test.for<[Partial<User>, string]>([
  [{ isAdmin: true }, "Admin"],
  [{ isModerator: true }, "Moderation"],
])("staff get a %o entry", ([flags, label]) => {
  render(SideNav, { props: { user: { ...me, ...flags } } });
  expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", "/admin");
});

test("the current section is highlighted; Home only on the home page", () => {
  at("/posts/manage");
  render(SideNav, { props: { user: me } });
  expect(isActive("Your posts")).toBe(true);
  expect(isActive("Home")).toBe(false);
});

test("another user's profile doesn't highlight your Profile", () => {
  at("/@adam");
  render(SideNav, { props: { user: me } });
  expect(isActive("Profile")).toBe(false);
});
