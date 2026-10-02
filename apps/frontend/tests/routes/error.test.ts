// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { readable } from "svelte/store";
import { afterEach, expect, test, vi } from "vitest";
import ErrorPage from "../../src/routes/+error.svelte";

const state = vi.hoisted(() => ({ status: 404, error: null as { message: string } | null }));
vi.mock(
  import("$app/stores"),
  () =>
    ({
      get page() {
        return readable({ status: state.status, error: state.error, url: new URL("http://localhost/x"), data: {} });
      },
      navigating: readable(null),
      updated: readable({ current: false }),
    }) as never,
);

afterEach(() => {
  state.status = 404;
  state.error = null;
});

test("a 404 gets its own copy and a way home", () => {
  render(ErrorPage);
  expect(screen.getByText("ERROR 404")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeInTheDocument();
  expect(screen.getByText(/never made it across the fediverse/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back home/ })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: /Search/ })).toHaveAttribute("href", "/search");
});

test("other errors show the error's message", () => {
  state.status = 500;
  state.error = { message: "Database unavailable" };
  render(ErrorPage);
  expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
  expect(screen.getByText("Database unavailable")).toBeInTheDocument();
});

test("an error without a message falls back to a generic one", () => {
  state.status = 503;
  render(ErrorPage);
  expect(screen.getByText("An unexpected error occurred. Please try again.")).toBeInTheDocument();
});
