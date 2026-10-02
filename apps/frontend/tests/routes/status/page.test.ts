import { env } from "$env/dynamic/public";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { readable } from "svelte/store";
import { afterEach, expect, test, vi } from "vitest";
import StatusPage from "../../../src/routes/status/+page.svelte";

const state = vi.hoisted(() => ({ instance: null as Record<string, unknown> | null }));
vi.mock(
  import("$app/stores"),
  () =>
    ({
      get page() {
        return readable({ data: { instance: state.instance }, url: new URL("http://localhost/status") });
      },
      navigating: readable(null),
      updated: readable({ current: false }),
    }) as never,
);

afterEach(() => {
  env.PUBLIC_STATUS_URL = "";
  state.instance = null;
});

test("lists the health endpoints and the federation state", () => {
  state.instance = { name: "Starlog", domain: "blog.example", federationEnabled: true };
  render(StatusPage);
  expect(screen.getByText("/api/version")).toBeInTheDocument();
  expect(screen.getByText(/Federation is enabled\./)).toBeInTheDocument();
  expect(screen.getByText("blog.example", { selector: "code" })).toBeInTheDocument();
  expect(screen.queryByText(/External status page/)).toBe(null);
});

test("links an external status page when configured", () => {
  env.PUBLIC_STATUS_URL = " https://status.blog.example ";
  render(StatusPage);
  expect(screen.getByRole("link", { name: "https://status.blog.example" })).toHaveAttribute("target", "_blank");
  expect(screen.getByText(/Federation is disabled\./)).toBeInTheDocument();
});
