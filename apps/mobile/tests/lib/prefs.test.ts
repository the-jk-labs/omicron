import { describe, expect, test } from "vitest";
import { homeFeed } from "@/lib/prefs";

describe("homeFeed", () => {
  // Bug: a signed-in reader who never picked a feed landed on Local instead of For you, as the web does.
  test("a signed-in reader opens on For you unless they chose otherwise", () => {
    expect(homeFeed(null, true)).toBe("for-you");
  });

  test("a saved choice wins", () => {
    expect(homeFeed("global", true)).toBe("global");
    expect(homeFeed("local", true)).toBe("local");
  });

  test("guests open on Local, even with For you saved", () => {
    expect(homeFeed(null, false)).toBe("local");
    expect(homeFeed("for-you", false)).toBe("local");
    expect(homeFeed("global", false)).toBe("global");
  });
});
