import ProfileLinksEditor from "$lib/components/ProfileLinksEditor.svelte";
import type { ProfileLink } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

const links = (n: number): ProfileLink[] =>
  Array.from({ length: n }, (_, i) => ({ platform: "website", url: `https://site${i}.example`, label: "" }));
const urls = () => screen.getAllByPlaceholderText("https://example.com").map((i) => (i as HTMLInputElement).value);

test("adds a blank website link, up to ten", async () => {
  render(ProfileLinksEditor, { props: { links: links(9) } });
  const add = screen.getByRole("button", { name: /Add link/ });
  await fireEvent.click(add);
  expect(urls()).toHaveLength(10);
  expect(urls().at(-1)).toBe("");
  expect(add).toBeDisabled();
});

test("reorders and removes links; the ends can't move further", async () => {
  render(ProfileLinksEditor, { props: { links: links(3) } });
  const up = screen.getAllByRole("button", { name: "Move up" });
  const down = screen.getAllByRole("button", { name: "Move down" });
  expect(up[0]).toBeDisabled();
  expect(down[2]).toBeDisabled();
  await fireEvent.click(down[0]);
  expect(urls()).toEqual(["https://site1.example", "https://site0.example", "https://site2.example"]);
  await fireEvent.click(screen.getAllByRole("button", { name: "Move up" })[2]);
  expect(urls()).toEqual(["https://site1.example", "https://site2.example", "https://site0.example"]);
  await fireEvent.click(screen.getAllByRole("button", { name: "Remove link" })[0]);
  expect(urls()).toEqual(["https://site2.example", "https://site0.example"]);
});

test("a handle platform shows its base as a prefix; a custom link asks for a label", () => {
  render(ProfileLinksEditor, {
    props: {
      links: [
        { platform: "github", url: "ada", label: "" },
        { platform: "custom", url: "https://x.example", label: "Portfolio" },
      ],
    },
  });
  expect(screen.getByText("github.com/")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("username")).toHaveValue("ada");
  expect(screen.getByPlaceholderText("Label (e.g. My portfolio)")).toHaveValue("Portfolio");
  expect(screen.getAllByRole("button", { name: "Link type" })).toHaveLength(2);
});
