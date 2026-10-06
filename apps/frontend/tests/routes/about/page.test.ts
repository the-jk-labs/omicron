// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";
import AboutPage from "../../../src/routes/about/+page.svelte";

const state = vi.hoisted(() => ({ instance: null as Record<string, unknown> | null }));
vi.mock(
  import("$app/state"),
  () =>
    ({
      get page() {
        return { data: { instance: state.instance }, url: new URL("http://localhost/about") };
      },
      navigating: null,
      updated: { current: false },
    }) as never,
);

afterEach(() => {
  state.instance = null;
});

test("names the instance and says whether it federates", () => {
  state.instance = { name: "Starlog", domain: "blog.example", federationEnabled: true };
  render(AboutPage);
  expect(screen.getByRole("heading", { level: 1, name: "About Starlog" })).toBeInTheDocument();
  expect(screen.getByText("blog.example")).toBeInTheDocument();
  expect(screen.getByText(/This instance is federating/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Browse the source" })).toHaveAttribute(
    "href",
    "https://github.com/the-jk-labs/omicron",
  );
});

test("falls back to the default name and says federation is off", () => {
  render(AboutPage);
  expect(screen.getByRole("heading", { level: 1, name: "About Omicron" })).toBeInTheDocument();
  expect(screen.getByText("this instance")).toBeInTheDocument();
  expect(screen.getByText("Federation is currently disabled on this instance.")).toBeInTheDocument();
});

test("renders administrator-managed About and rules content", () => {
  state.instance = {
    name: "Starlog",
    domain: "blog.example",
    aboutHtml: "<p>Writing about art and science.</p>",
    rulesHtml: "<p>No spam.</p>",
  };
  render(AboutPage);
  expect(screen.getByText("Writing about art and science.")).toBeInTheDocument();
  expect(screen.getByText("No spam.")).toBeInTheDocument();
  expect(screen.queryByText(/Until custom rules are published here/)).not.toBeInTheDocument();
});
