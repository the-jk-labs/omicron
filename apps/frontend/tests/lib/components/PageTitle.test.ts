import PageTitle from "$lib/components/PageTitle.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { render } from "@testing-library/svelte";
import { expect, test } from "vitest";

// The $app/stores stand-in carries no instance, so the public env name applies.
test("a page title is suffixed with the instance name", () => {
  render(PageTitle, { props: { text: "Settings" } });
  expect(document.title).toBe("Settings · Omicron");
});

test("without text the title is the instance's own tagline", () => {
  render(PageTitle, { props: {} });
  expect(document.title).toBe("Omicron: an independent blogging platform on the fediverse");
});
