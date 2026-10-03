// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import ContactPage from "../../../src/routes/contact/+page.svelte";
import { setPublicEnv } from "../../mocks/$app/env/public.js";

const state = vi.hoisted(() => ({ instance: null as Record<string, unknown> | null }));
vi.mock(
  import("$app/state"),
  () =>
    ({
      get page() {
        return { data: { instance: state.instance }, url: new URL("http://localhost/contact") };
      },
      navigating: null,
      updated: { current: false },
    }) as never,
);

afterEach(() => {
  setPublicEnv();
  state.instance = null;
});

const text = () => document.body.textContent.replace(/\s+/g, " ");

test("without configured addresses it explains how to report and how to configure", () => {
  render(ContactPage);
  expect(text()).toContain("Reach the operator of this instance (Omicron)");
  expect(screen.getByText(/has not published a dedicated contact address yet/)).toBeInTheDocument();
  expect(
    screen.getByText("Use the Flag action on the post or user, or write to the general contact above."),
  ).toBeInTheDocument();
});

test("a contact email is used for abuse reports too unless one is set", () => {
  setPublicEnv({ PUBLIC_CONTACT_EMAIL: " hi@blog.example " });
  const { unmount } = render(ContactPage);
  expect(screen.getAllByRole("link", { name: "hi@blog.example" }).map((a) => a.getAttribute("href"))).toEqual([
    "mailto:hi@blog.example",
    "mailto:hi@blog.example",
  ]);
  unmount();
  setPublicEnv({ PUBLIC_CONTACT_EMAIL: " hi@blog.example ", PUBLIC_ABUSE_EMAIL: "abuse@blog.example" });
  render(ContactPage);
  expect(screen.getByRole("link", { name: "abuse@blog.example" })).toHaveAttribute("href", "mailto:abuse@blog.example");
});

test("a contact URL is offered when there's no email", () => {
  setPublicEnv({ PUBLIC_CONTACT_URL: "https://blog.example/imprint" });
  render(ContactPage);
  expect(screen.getByRole("link", { name: "https://blog.example/imprint" })).toHaveAttribute("target", "_blank");
});

test("the instance name and domain come from the instance settings", () => {
  state.instance = { name: "Starlog", domain: "blog.example", federationEnabled: false };
  render(ContactPage);
  expect(text()).toContain("Reach the operator of blog.example (Starlog)");
});

test("the federation sentence keeps its space", () => {
  state.instance = { name: "Starlog", domain: "blog.example", federationEnabled: true };
  render(ContactPage);
  expect(text()).toContain("federates via ActivityPub at blog.example.");
});
