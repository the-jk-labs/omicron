// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { load } from "../../../src/routes/compose/+page.server";
import { event, user } from "../event";

const routes = {};

test("a guest is sent to sign in", async () => {
  await expect(load(event({ routes }).event)).rejects.toMatchObject({ status: 302, location: "/login" });
});

test("a signed-in user gets the page data", async () => {
  expect(await load(event({ routes, user: user() }).event)).toEqual({ composeLang: null });
});

test("the default language is the one last published in, from its cookie", async () => {
  const e = event({ routes, user: user(), cookies: { "compose-lang": "az" }, headers: { "accept-language": "tr" } });
  expect(await load(e.event)).toEqual({ composeLang: "az" });
});

test("without a remembered one, the browser's language is the default", async () => {
  const e = event({ routes, user: user(), headers: { "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" } });
  expect(await load(e.event)).toEqual({ composeLang: "pt" });
});

test("a language we don't list is no default at all", async () => {
  const e = event({ routes, user: user(), cookies: { "compose-lang": "xx" }, headers: { "accept-language": "tlh" } });
  expect(await load(e.event)).toEqual({ composeLang: null });
});
