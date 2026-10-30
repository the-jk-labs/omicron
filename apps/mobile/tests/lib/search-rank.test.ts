import type { RelationActor, SearchResults, TagWithCount } from "@omicron/contract";
import { describe, expect, test } from "vitest";
import { compactCount, joinedLabel } from "@/lib/format";
import { rankSearchSections } from "@/lib/search-rank";
import { makePost } from "../fixtures";

const post = (title: string) => makePost({ id: title, title });
const person = (username: string, displayName = username): RelationActor => ({
  id: username,
  username,
  displayName,
  avatarUrl: null,
  remote: false,
});
const tag = (name: string): TagWithCount => ({ name, slug: name.toLowerCase(), postCount: 1 });
const results = (partial: Partial<SearchResults>): SearchResults => ({ posts: [], people: [], tags: [], ...partial });

describe("rankSearchSections", () => {
  test("articles lead when nothing matches better", () => {
    expect(
      rankSearchSections(
        "react",
        results({ posts: [post("Learning React")], people: [person("bob")], tags: [tag("js")] }),
      ),
    ).toEqual(["posts", "people", "tags"]);
  });

  test("an exact username puts people first", () => {
    expect(
      rankSearchSections("yusif", results({ posts: [post("A post about yusif's app")], people: [person("yusif")] })),
    ).toEqual(["people", "posts"]);
  });

  test("a display name word prefix beats an article that only mentions it", () => {
    expect(
      rankSearchSections("tomm", results({ posts: [post("Notes")], people: [person("tc", "Tommaso Croce")] })),
    ).toEqual(["people", "posts"]);
  });

  test("an exact tag, typed with or without #, puts tags first", () => {
    const found = results({ posts: [post("Physics notes")], tags: [tag("Physics")] });
    expect(rankSearchSections("#physics", found)).toEqual(["tags", "posts"]);
    expect(rankSearchSections(" PHYSICS ", found)).toEqual(["tags", "posts"]);
  });

  test("empty groups are left out, so no results gives no sections", () => {
    expect(rankSearchSections("x", results({ people: [person("xavier")] }))).toEqual(["people"]);
    expect(rankSearchSections("x", results({}))).toEqual([]);
  });

  test("an untitled post doesn't break ranking", () => {
    expect(rankSearchSections("a", results({ posts: [makePost({ title: null })] }))).toEqual(["posts"]);
  });
});

describe("compactCount", () => {
  test.each([
    [0, "0"],
    [999, "999"],
    [1000, "1K"],
    [3549, "3.5K"],
    [9999, "9.9K"],
    [12_345, "12K"],
    [999_999, "999K"],
    [1_250_000, "1.2M"],
  ])("%i → %s", (n, label) => {
    expect(compactCount(n)).toBe(label);
  });
});

test("joinedLabel names the month and year", () => {
  expect(joinedLabel("2013-09-15T12:00:00Z", "UTC")).toBe("Joined September 2013");
});
