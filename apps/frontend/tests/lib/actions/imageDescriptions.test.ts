// SPDX-License-Identifier: AGPL-3.0-or-later
import { waitFor } from "@testing-library/svelte";
import { afterEach, expect, test } from "vitest";
import { imageDescriptions } from "#lib/actions/imageDescriptions.js";

let stop: (() => void) | undefined;
afterEach(() => {
  stop?.();
  document.body.replaceChildren();
});

function setup(html: string) {
  document.body.innerHTML = html;
  const action = imageDescriptions(document.body);
  stop = action.destroy;
  action.update(true);
  return action;
}

test("hidden informative images get visible descriptions without duplicate screen-reader speech", () => {
  setup('<p><img alt="A graph" lang="fr" dir="rtl" src="/a.gif"></p><img alt="" src="/b.gif">');
  const description = document.querySelector(".hidden-image-description")!;
  expect(description).toHaveTextContent("Image hidden: A graph");
  expect(description).toHaveAttribute("aria-hidden", "true");
  expect(description).toHaveAttribute("lang", "fr");
  expect(description).toHaveAttribute("dir", "rtl");
  expect(document.querySelectorAll(".hidden-image-description")).toHaveLength(1);
  expect(document.querySelector("img")).toHaveAttribute("alt", "A graph");
});

test("the editing DOM is never changed, including noneditable image node views", () => {
  const html = '<div contenteditable="true"><div contenteditable="false"><img alt="A cat" src="/a.gif"></div></div>';
  setup(html);
  expect(document.body.innerHTML).toBe(html);
});

test("read-only and server-rendered editor bodies are never changed either", () => {
  const html =
    '<div contenteditable="false"><img alt="Imported image" src="/a.gif"></div><div class="tiptap"><img alt="Preview" src="/b.gif"></div>';
  setup(html);
  expect(document.body.innerHTML).toBe(html);
});

test("new and updated descriptions are observed and removed when showing images", async () => {
  const action = setup('<img alt="Old description" src="/a.gif">');
  const image = document.querySelector("img")!;
  image.alt = '<script>alert("x")</script>';
  await waitFor(() => expect(document.querySelector(".hidden-image-description")).toHaveTextContent(image.alt));
  expect(document.querySelector("script")).toBeNull();
  document.body.insertAdjacentHTML("beforeend", '<img alt="New image" src="/b.png">');
  await waitFor(() => expect(document.querySelectorAll(".hidden-image-description")).toHaveLength(2));
  image.remove();
  await waitFor(() => expect(document.querySelectorAll(".hidden-image-description")).toHaveLength(1));
  action.update(false);
  expect(document.querySelector(".hidden-image-description")).toBeNull();
});

test("cleanup restores the content DOM without changing image sources", () => {
  const action = setup('<p><img alt="A graph" src="/a.gif"></p>');
  action.destroy();
  expect(document.body.innerHTML).toBe('<p><img alt="A graph" src="/a.gif"></p>');
});

test("language changes settle without observing the description's own unchanged attributes", async () => {
  setup('<p lang="fr" dir="ltr"><img alt="A graph" src="/a.gif"></p>');
  const paragraph = document.querySelector("p")!;
  paragraph.lang = "de";
  paragraph.dir = "rtl";
  await waitFor(() => expect(document.querySelector(".hidden-image-description")).toHaveAttribute("lang", "de"));
  expect(document.querySelector(".hidden-image-description")).toHaveAttribute("dir", "rtl");
});
