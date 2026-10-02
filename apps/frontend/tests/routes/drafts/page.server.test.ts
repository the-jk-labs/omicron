// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../src/routes/drafts/+page.server";
import { event } from "../event";

test("the old drafts page moves to the Drafts tab of post management", async () => {
  expect(() => load(event().event)).toThrow(
    expect.objectContaining({ status: 308, location: "/posts/manage?tab=draft" }),
  );
});
