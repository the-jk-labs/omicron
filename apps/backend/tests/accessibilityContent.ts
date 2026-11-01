// SPDX-License-Identifier: AGPL-3.0-or-later
import { load } from "cheerio";
import { expect } from "vitest";
import { sanitizePostHtml } from "@/lib/sanitize.ts";

export const accessibilityContent = sanitizePostHtml(
  '<p lang="fr" dir="ltr">Translated passage</p>' +
    '<figure aria-labelledby="graph-caption" aria-describedby="graph-description">' +
    '<img src="/api/uploads/chart.png" alt="Sales increased from 10 to 20" lang="en" width="400">' +
    '<figcaption id="graph-caption" lang="de">Sales graph</figcaption></figure>' +
    '<p id="graph-description">Sales doubled.</p><a href="#graph-description">Full graph description</a>' +
    '<img src="/api/uploads/decoration.png" alt="">' +
    '<table aria-labelledby="sales"><caption id="sales" lang="en">Sales table</caption>' +
    '<thead><tr><th id="year" scope="col">Year</th><th id="value" scope="col">Sales</th></tr></thead>' +
    '<tbody><tr><th id="current" scope="row">2026</th><td headers="current value">20</td></tr></tbody></table>' +
    '<math aria-label="x plus one"><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow></math>',
);

export function expectAccessibleContent(html: string, imageSource: string) {
  const $ = load(html, {}, false);
  expect($('p[lang="fr"]').attr("dir")).toBe("ltr");
  expect($("figure").attr("aria-labelledby")).toBe("omicron-content-graph-caption");
  expect($("figure").attr("aria-describedby")).toBe("omicron-content-graph-description");
  expect($("figure img").attr("src")).toBe(imageSource);
  expect($("figure img").attr("alt")).toBe("Sales increased from 10 to 20");
  expect($("figure img").attr("lang")).toBe("en");
  expect($("figcaption").attr("id")).toBe("omicron-content-graph-caption");
  expect($("figcaption").attr("lang")).toBe("de");
  expect($("#omicron-content-graph-description").text()).toBe("Sales doubled.");
  expect($('img[alt=""]').length).toBe(1);
  expect($("caption").attr("id")).toBe("omicron-content-sales");
  expect($("table").attr("aria-labelledby")).toBe("omicron-content-sales");
  expect($("#omicron-content-year").attr("scope")).toBe("col");
  expect($("#omicron-content-current").attr("scope")).toBe("row");
  expect($("td").attr("headers")).toBe("omicron-content-current omicron-content-value");
  expect($("math").attr("aria-label")).toBe("x plus one");
  expect($("math mi").text()).toBe("x");
}
