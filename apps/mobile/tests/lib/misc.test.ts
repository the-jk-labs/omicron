import type { Notification, Profile, RemoteProfile } from "@omicron/contract";
import { describe, expect, test, vi } from "vitest";
import { shortAgo } from "@/lib/format";
import { highlightCode } from "@/lib/html/highlight";
import { parseJson } from "@/lib/json";
import { isRemoteUsername, postPath, profilePath, tagPath, usernameFromHandle } from "@/lib/links";
import { notificationAction, notificationHref, notificationSubject } from "@/lib/notifications";
import { toProfileData } from "@/lib/query/profile";
import { makeUser } from "../fixtures";

vi.mock("@/components/instance-provider", () => ({ useApi: vi.fn<() => void>() }));

describe("links", () => {
  test("posts, profiles and tags use the web's paths", () => {
    expect(postPath({ id: "9e962281-aaaa", slug: "hello-world", author: { username: "ada" } })).toBe(
      "/@ada/hello-world",
    );
    expect(postPath({ id: "9e962281-aaaa", slug: null, author: { username: "bob@remote.example" } })).toBe(
      "/@bob@remote.example/9e962281",
    );
    expect(profilePath("ada")).toBe("/@ada");
    expect(tagPath("c++")).toBe("/tags/c%2B%2B");
  });

  test("route handles back to usernames", () => {
    expect(usernameFromHandle("@ada")).toBe("ada");
    expect(usernameFromHandle("%40bob%40remote.example")).toBe("bob@remote.example");
    expect(isRemoteUsername("bob@remote.example")).toBe(true);
    expect(isRemoteUsername("ada")).toBe(false);
  });
});

describe("notifications", () => {
  const base: Notification = {
    id: "n1",
    type: "like",
    actor: { id: "u1", username: "ada", displayName: "Ada", avatarUrl: null, remote: false },
    postId: "p1",
    postTitle: "Hello",
    commentSnippet: null,
    read: false,
    createdAt: "2026-10-01T10:00:00.000Z",
  };

  test("wording and targets match the web", () => {
    expect(`${notificationSubject(base)} ${notificationAction(base.type)}`).toBe("Ada liked your post");
    expect(notificationHref(base)).toBe("/posts/p1");
    expect(notificationHref({ ...base, type: "follow" })).toBe("/@ada");
    expect(notificationHref({ ...base, type: "follow_request" })).toBe("/follow-requests");
  });

  test("a published schedule has no actor", () => {
    const published = { ...base, type: "post_published" as const, actor: null };
    expect(`${notificationSubject(published)} ${notificationAction(published.type)}`).toBe(
      "Your scheduled post is now live",
    );
  });
});

describe("toProfileData", () => {
  test("a remote profile gets the local shape", () => {
    const remote: RemoteProfile = {
      user: {
        id: "r1",
        username: "bob@remote.example",
        displayName: "Bob",
        bio: "",
        avatarUrl: null,
        host: "remote.example",
        apId: "https://remote.example/users/bob",
        remote: true,
        tags: [],
      },
      counts: { followers: 3, following: 4 },
      isFollowing: true,
      isMuted: false,
      isBlocked: false,
    };
    expect(toProfileData(remote)).toMatchObject({ remote: true, followState: "following", locked: false });
  });

  test("a local profile keeps its own follow state", () => {
    const local: Profile = {
      user: makeUser({ isPrivate: true }),
      counts: { followers: 0, following: 0 },
      followState: "requested" as const,
      isFollowing: false,
      isMuted: false,
      isBlocked: false,
      locked: true,
    };
    expect(toProfileData(local)).toMatchObject({
      remote: false,
      followState: "requested",
      locked: true,
    });
  });
});

describe("highlightCode", () => {
  test("a declared language is coloured", () => {
    const tokens = highlightCode("const answer = 42;", "javascript");
    expect(tokens.map((t) => t.text).join("")).toBe("const answer = 42;");
    expect(tokens.find((t) => t.text === "const")?.tone).toBe("keyword");
    expect(tokens.find((t) => t.text === "42")?.tone).toBe("literal");
  });

  test("prose in a fence stays plain", () => {
    expect(highlightCode("If it shows enabled we can do our next step", null)).toEqual([
      { text: "If it shows enabled we can do our next step" },
    ]);
  });

  test("an unknown declared language never throws", () => {
    expect(highlightCode("x", "not-a-language")).toEqual([{ text: "x" }]);
  });
});

describe("parseJson", () => {
  test("parses JSON and yields undefined for malformed text", () => {
    expect(parseJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseJson("not json")).toBeUndefined();
  });
});

describe("shortAgo", () => {
  const now = Date.parse("2026-10-28T12:00:00.000Z");
  const ago = (ms: number) => shortAgo(new Date(now - ms).toISOString(), now);
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  test("counts up from now through minutes, hours, days, weeks, months and years", () => {
    expect(ago(30_000)).toBe("now");
    expect(ago(5 * MIN)).toBe("5m");
    expect(ago(7 * HOUR)).toBe("7h");
    expect(ago(DAY)).toBe("1d");
    expect(ago(5 * DAY)).toBe("5d");
    expect(ago(14 * DAY)).toBe("2w");
    expect(ago(65 * DAY)).toBe("2mo");
    expect(ago(400 * DAY)).toBe("1y");
  });

  test("switches unit exactly at each boundary", () => {
    expect(ago(59 * MIN)).toBe("59m");
    expect(ago(60 * MIN)).toBe("1h");
    expect(ago(23 * HOUR)).toBe("23h");
    expect(ago(6 * DAY)).toBe("6d");
    expect(ago(7 * DAY)).toBe("1w");
    expect(ago(29 * DAY)).toBe("4w");
    expect(ago(30 * DAY)).toBe("1mo");
    expect(ago(364 * DAY)).toBe("12mo");
    expect(ago(365 * DAY)).toBe("1y");
  });

  test("a timestamp slightly in the future (clock skew) reads as now", () => {
    expect(shortAgo(new Date(now + 90_000).toISOString(), now)).toBe("now");
  });
});
