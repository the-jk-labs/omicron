// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Page from "../../../../src/routes/oauth/authorize/+page.svelte";

test("consent clearly identifies the destination, account and narrow permission", () => {
  render(Page, {
    data: {
      consent: {
        ticket: "fixture-ticket",
        name: "Unverified Directory",
        callbackOrigin: "https://client.example",
        username: "ada",
        scope: "read:accounts",
      },
    } as never,
    form: null,
  });
  expect(screen.getByText("Sign in with Omicron")).toBeVisible();
  expect(screen.getByText("Unverified Directory")).toBeVisible();
  expect(screen.getByText("https://client.example")).toBeVisible();
  expect(screen.getByText("@ada")).toBeVisible();
  expect(screen.getByText(/cannot read your email/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Deny" })).toHaveAttribute("value", "deny");
  expect(screen.getByRole("button", { name: "Allow identity verification" })).toHaveAttribute("value", "allow");
});

test("authorization failures are accessible and untrusted application names stay text", () => {
  render(Page, {
    data: {
      consent: {
        ticket: "t",
        name: "<img src=x onerror=alert(1)>",
        callbackOrigin: "https://client.example",
        username: "ada",
        scope: "read:accounts",
      },
    } as never,
    form: { error: "This request expired." },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("This request expired.");
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeVisible();
  expect(document.querySelector("img[onerror]")).toBeNull();
});
