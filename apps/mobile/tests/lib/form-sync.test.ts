import { describe, expect, test } from "vitest";
import { mergeUnedited, sameValues } from "@/lib/form-sync";

describe("mergeUnedited", () => {
  const base = { name: "Ada", bio: "Hi", links: [{ url: "a" }] };

  test("untouched fields take the refreshed values", () => {
    const next = { name: "Ada L.", bio: "Hello", links: [{ url: "b" }] };
    expect(mergeUnedited(base, base, next)).toEqual(next);
  });

  test("an edited field keeps the person's edit while the others refresh", () => {
    const current = { ...base, bio: "Typing…" };
    const next = { name: "Ada L.", bio: "Hello", links: [{ url: "a" }] };
    expect(mergeUnedited(current, base, next)).toEqual({ name: "Ada L.", bio: "Typing…", links: [{ url: "a" }] });
  });

  test("lists compare by value, not identity", () => {
    const current = { ...base, links: [{ url: "a" }] };
    const next = { ...base, links: [{ url: "c" }] };
    expect(mergeUnedited(current, base, next).links).toEqual([{ url: "c" }]);
  });
});

test("sameValues compares snapshots by value", () => {
  expect(sameValues({ a: [1] }, { a: [1] })).toBe(true);
  expect(sameValues({ a: [1] }, { a: [2] })).toBe(false);
});
