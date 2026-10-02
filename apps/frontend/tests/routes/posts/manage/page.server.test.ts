// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../../src/routes/posts/manage/+page.server";
import { event, user } from "../../event";

function routes(counts: Record<string, number>) {
  return {
    "GET /api/posts/mine/counts": counts,
    "GET /api/posts/mine": (req: Request) => Response.json({ items: [new URL(req.url).searchParams.get("status")] }),
  };
}

const run = (counts: Record<string, number>, tab?: string) =>
  load(
    event({
      url: `https://blog.example/posts/manage${tab ? `?tab=${tab}` : ""}`,
      routes: routes(counts),
      user: user(),
    }).event,
  ) as Promise<{ tab: string; page: { items: string[] } }>;

test("a guest is sent to sign in", async () => {
  await expect(load(event({ url: "https://blog.example/posts/manage" }).event)).rejects.toMatchObject({ status: 302 });
});

test("the requested tab is honoured", async () => {
  const data = await run({ draft: 0, scheduled: 0, published: 5 }, "scheduled");
  expect([data.tab, data.page.items]).toEqual(["scheduled", ["scheduled"]]);
});

test.for([
  [{ draft: 0, scheduled: 2, published: 5 }, "scheduled"],
  [{ draft: 0, scheduled: 0, published: 5 }, "published"],
  [{ draft: 1, scheduled: 2, published: 5 }, "draft"],
  [{ draft: 0, scheduled: 0, published: 0 }, "draft"],
] as const)("without a tab, %o opens on %s", async ([counts, tab]) => {
  expect((await run(counts)).tab).toBe(tab);
});

test("an unknown tab is treated as none", async () => {
  expect((await run({ draft: 0, scheduled: 0, published: 1 }, "trash")).tab).toBe("published");
});
