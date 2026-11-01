// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, test } from "vitest";
import { contentLoss } from "#lib/editor/contentLoss.js";

test("equivalent mark names, whitespace and added defaults do not report loss", () => {
  expect(
    contentLoss("<p><b>A</b> <i>B</i><del>C</del></p>", "<p><strong>A</strong>\n<em>B</em><s>C</s></p><p></p>"),
  ).toEqual([]);
});

test("lost structure, language, alternatives and references are reported", () => {
  const html = '<figure><img alt="A chart" src="/a.png"><figcaption lang="fr" id="caption">Sales</figcaption></figure>';
  expect(contentLoss(html, '<img src="/a.png"><p>Sales</p>')).toEqual(
    expect.arrayContaining([
      "element: figure",
      "element: figcaption",
      "img alt: A chart",
      "figcaption lang: fr",
      "figcaption id: caption",
    ]),
  );
});

test("repeated metadata and table relationships are counted, not just found", () => {
  expect(contentLoss('<p lang="fr">A</p><p lang="fr">B</p>', '<p lang="fr">A</p><p>B</p>')).toContain("p lang: fr");
  expect(
    contentLoss(
      '<table><tr><th id="year">Year</th><td headers="year" rowspan="2">2026</td></tr></table>',
      "<table><tr><th>Year</th><td>2026</td></tr></table>",
    ),
  ).toEqual(expect.arrayContaining(["th id: year", "td headers: year", "td rowspan: 2"]));
});

test("lost text and meaningful attributes are reported, not exposed as HTML", () => {
  expect(contentLoss('<p title="Details" role="note">Important</p>', "<p>Changed</p>")).toEqual([
    "p title: Details",
    "p role: note",
    "text content",
  ]);
});
