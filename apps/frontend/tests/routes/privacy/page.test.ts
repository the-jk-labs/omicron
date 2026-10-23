import { page } from "$app/state";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";
import PrivacyPage from "../../../src/routes/privacy/+page.svelte";

vi.mock(
  import("$app/state"),
  () =>
    ({
      page: {
        data: { instance: { name: "Starlog", domain: "blog.example" } },
        url: new URL("http://localhost/privacy"),
      },
      navigating: null,
      updated: { current: false },
    }) as never,
);

beforeEach(() => {
  Object.assign(page, { data: { instance: { name: "Starlog", domain: "blog.example" } } });
});

test("is a placeholder notice naming the instance, with links to act on it", () => {
  render(PrivacyPage);
  expect(screen.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeInTheDocument();
  expect(screen.getByText(`Last updated: ${new Date().getFullYear()} · blog.example`)).toBeInTheDocument();
  expect(screen.getByText("Starlog (blog.example)")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  expect(screen.queryByRole("heading", { name: "Optional website statistics" })).toBeNull();
});

test.for([null, "<p>Operator privacy policy.</p>"])(
  "Umami disclosure remains visible alongside policy %s, including for opted-out readers",
  (privacyPolicyHtml) => {
    Object.assign(page, {
      data: {
        instance: { name: "Starlog", domain: "blog.example", privacyPolicyHtml },
        umami: { websiteId: "94db1cb1-74f4-4a40-ad6c-962362670409", allowed: false },
      },
    });
    render(PrivacyPage);
    expect(screen.getByRole("heading", { name: "Optional website statistics" })).toBeInTheDocument();
    expect(
      screen.getByText(/browser information and your IP address are forwarded to Umami Cloud/),
    ).toBeInTheDocument();
    if (privacyPolicyHtml) expect(screen.getByText("Operator privacy policy.")).toBeInTheDocument();
  },
);
