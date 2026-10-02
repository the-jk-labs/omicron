// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../../src/routes/lists/[id]/+page.server";
import { apiError } from "../../../fakeFetch";
import { event } from "../../event";

const LIST = { id: "66635376-1111-2222-3333-444444444444", title: "Weekend reads" };
const routes = {
  "GET /api/lists/66635376": { list: LIST, owner: { username: "ada" } },
  "GET /api/lists/66635376/items": { items: [], nextCursor: null },
};

test("serves the list at its canonical path", async () => {
  const data = await load(
    event({
      url: "https://blog.example/lists/weekend-reads-66635376",
      params: { id: "weekend-reads-66635376" },
      routes,
    }).event,
  );
  expect(data).toMatchObject({ list: LIST, page: { items: [] } });
});

test("a retitled or id-only link moves to the canonical path", async () => {
  await expect(
    load(event({ url: "https://blog.example/lists/old-66635376", params: { id: "old-66635376" }, routes }).event),
  ).rejects.toMatchObject({ status: 308, location: "/lists/weekend-reads-66635376" });
});

test("no id, a missing list and a private one are all a 404", async () => {
  await expect(load(event({ params: { id: "no-id-here" } }).event)).rejects.toMatchObject({ status: 404 });
  await expect(load(event({ params: { id: "x-66635376" } }).event)).rejects.toMatchObject({ status: 404 });
  await expect(
    load(event({ params: { id: "x-66635376" }, routes: { "*": apiError(401) } }).event),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    load(event({ params: { id: "x-66635376" }, routes: { "*": apiError(500) } }).event),
  ).rejects.toMatchObject({ status: 500 });
});
