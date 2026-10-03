// SPDX-License-Identifier: AGPL-3.0-or-later
import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";
import TagList from "#lib/components/TagList.svelte";

test("each tag links to its page by slug, shown by name", () => {
  render(TagList, {
    props: {
      tags: [
        { slug: "csharp", name: "csharp" },
        { slug: "deno", name: "Deno" },
      ],
    },
  });
  expect(screen.getByRole("link", { name: "#Deno" })).toHaveAttribute("href", "/tags/deno");
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

test("no tags, no list", () => {
  const { container } = render(TagList, { props: { tags: [] } });
  expect(container.querySelector("ul")).toBe(null);
});
