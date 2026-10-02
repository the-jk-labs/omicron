import ProfileLinkIcon from "$lib/components/ProfileLinkIcon.svelte";
import { platformMeta } from "$lib/profileLinks";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { render } from "@testing-library/svelte";
import { expect, test } from "vitest";

test("a brand platform draws its own mark at the requested size", () => {
  const { container } = render(ProfileLinkIcon, { props: { platform: "github", size: 24 } });
  const svg = container.querySelector("svg")!;
  expect(svg).toHaveAttribute("width", "24");
  expect(svg.querySelector("path")).toHaveAttribute("d", platformMeta("github").brand);
});

test("a generic platform, or an unknown one, uses an icon instead", () => {
  const website = render(ProfileLinkIcon, { props: { platform: "website" } }).container.querySelector("svg path");
  const unknown = render(ProfileLinkIcon, { props: { platform: "myspace" } }).container.querySelector("svg");
  expect(website?.getAttribute("d")).not.toBe(platformMeta("github").brand);
  expect(unknown).not.toBe(null);
});
