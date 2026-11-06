import { describe, expect, test } from "vitest";
import { markerAt, pagesToKeep } from "@/lib/swipe-pages";

describe("pagesToKeep", () => {
  const pages = ["for-you", "local", "global"];

  test("adds the neighbours of the page in view", () => {
    expect(pagesToKeep(pages, 0, new Set())).toEqual(new Set(["for-you", "local"]));
    expect(pagesToKeep(pages, 1, new Set())).toEqual(new Set(pages));
  });

  test("keeps what's already mounted, so a page keeps its scroll position", () => {
    expect(pagesToKeep(pages, 2, new Set(["for-you"]))).toEqual(new Set(pages));
  });

  test("drops a page that no longer exists, as For you does on sign-out", () => {
    expect(pagesToKeep(["local", "global"], 0, new Set(["for-you", "local"]))).toEqual(new Set(["local", "global"]));
  });
});

describe("markerAt", () => {
  const layouts = [
    { x: 0, width: 100 },
    { x: 100, width: 200 },
    { x: 300, width: 100 },
  ];

  test("sits on a tab when the pager rests on its page", () => {
    expect(markerAt(0, layouts, 0)).toEqual({ x: 0, width: 100 });
    expect(markerAt(1, layouts, 0)).toEqual({ x: 100, width: 200 });
    expect(markerAt(2, layouts, 0)).toEqual({ x: 300, width: 100 });
  });

  test("moves and resizes in step with a drag, including between tabs of different widths", () => {
    expect(markerAt(0.5, layouts, 0)).toEqual({ x: 50, width: 150 });
    expect(markerAt(1.25, layouts, 0)).toEqual({ x: 150, width: 175 });
  });

  test("the inset shortens it to the middle of the tab, wherever it is", () => {
    expect(markerAt(0, layouts, 0.2)).toEqual({ x: 20, width: 60 });
    expect(markerAt(0.5, layouts, 0.2)).toEqual({ x: 80, width: 90 });
  });

  test("stays on the first and last tabs if an overscroll reports a position past them", () => {
    expect(markerAt(-0.3, layouts, 0)).toEqual({ x: 0, width: 100 });
    expect(markerAt(2.4, layouts, 0)).toEqual({ x: 300, width: 100 });
  });

  test("a single tab has nowhere to go", () => {
    expect(markerAt(0, [{ x: 10, width: 50 }], 0)).toEqual({ x: 10, width: 50 });
  });
});
