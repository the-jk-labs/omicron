import {
  identifierToUrl,
  inputPrefix,
  linkSubtitle,
  PLATFORMS,
  platformMeta,
  urlToIdentifier,
} from "$lib/profileLinks";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";

test("every platform is unique and an unknown key falls back to a custom link", () => {
  const keys = PLATFORMS.map((p) => p.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(platformMeta("myspace").key).toBe("custom");
  for (const p of PLATFORMS) expect(Boolean(p.brand) || Boolean(p.icon)).toBe(true);
});

test("input prefixes show the base without scheme or www", () => {
  expect(inputPrefix(platformMeta("github"))).toBe("github.com/");
  expect(inputPrefix(platformMeta("linkedin"))).toBe("linkedin.com/");
  expect(inputPrefix(platformMeta("mastodon"))).toBe("");
});

describe("identifierToUrl", () => {
  test.for([
    ["website", "example.com/blog", "https://example.com/blog"],
    ["website", "http://example.com", "http://example.com/"],
    ["github", "@ada", "https://github.com/ada"],
    ["github", "/ada/", "https://github.com/ada"],
    ["github", "https://github.com/ada", "https://github.com/ada"],
    ["mastodon", "@ada@Mastodon.Social", "https://mastodon.social/@ada"],
    ["pixelfed", "ada@pixelfed.social", "https://pixelfed.social/@ada"],
    ["matrix", "@ada:matrix.org", "https://matrix.to/#/@ada:matrix.org"],
    ["xmpp", "ada@jabber.example", "xmpp:ada@jabber.example"],
    ["irc", "irc.libera.chat/#deno", "ircs://irc.libera.chat/#deno"],
    ["irc", "irc://irc.example/#x", "irc://irc.example/#x"],
    ["linkedin", "in/ada", "https://www.linkedin.com/in/ada"],
    ["linkedin", "Company/acme/", "https://www.linkedin.com/company/acme"],
    ["linkedin", "ada-lovelace", "https://www.linkedin.com/in/ada-lovelace"],
    ["linkedin", "linkedin.com/in/ada", "https://linkedin.com/in/ada"],
    ["signal", "ada.01", "https://signal.me/#u/ada.01"],
  ])("%s %s → %s", ([platform, raw, url]) => {
    expect(identifierToUrl(platform, raw)).toBe(url);
  });

  test.for([
    ["website", ""],
    ["website", "localhost"],
    ["website", "javascript:alert(1)"],
    ["website", "ftp://example.com"],
    ["mastodon", "ada"],
    ["mastodon", "ada@localhost"],
    ["matrix", "ada"],
    ["xmpp", "ada"],
    ["irc", "nodots"],
    ["linkedin", "a/b/c"],
    ["github", "@"],
  ])("%s %s is refused", ([platform, raw]) => {
    expect(identifierToUrl(platform, raw)).toBe(null);
  });

  test("a mailto address typed as a website is refused", () => {
    expect(identifierToUrl("website", "mailto:ada@example.com")).toBe(null);
  });
});

describe("urlToIdentifier / linkSubtitle", () => {
  test.for([
    ["github", "https://github.com/ada", "ada"],
    ["github", "https://github.com/ada/", "ada"],
    ["github", "https://gitlab.com/elsewhere/", "elsewhere"],
    ["mastodon", "https://mastodon.social/@ada", "@ada@mastodon.social"],
    ["mastodon", "https://mastodon.social/", "https://mastodon.social/"],
    ["matrix", "https://matrix.to/#/@ada:matrix.org", "@ada:matrix.org"],
    ["matrix", "https://matrix.to/", "https://matrix.to/"],
    ["xmpp", "xmpp:ada@jabber.example", "ada@jabber.example"],
    ["irc", "ircs://irc.libera.chat/#deno", "irc.libera.chat/#deno"],
    ["linkedin", "https://www.linkedin.com/in/ada/", "in/ada"],
    ["linkedin", "https://example.com/in/ada", "https://example.com/in/ada"],
    ["website", "https://example.com", "https://example.com"],
    ["github", "not a url", "not a url"],
  ])("%s %s ↔ %s", ([platform, url, identifier]) => {
    expect(urlToIdentifier(platform, url)).toBe(identifier);
  });

  test("identifiers round-trip through a URL", () => {
    for (const [platform, raw] of [
      ["github", "ada"],
      ["mastodon", "@ada@mastodon.social"],
      ["matrix", "@ada:matrix.org"],
      ["linkedin", "in/ada"],
    ]) {
      expect(urlToIdentifier(platform, identifierToUrl(platform, raw)!)).toBe(raw);
    }
  });

  test("a plain link's subtitle is a compact host + path", () => {
    expect(linkSubtitle("website", "https://www.example.com/")).toBe("example.com");
    expect(linkSubtitle("custom", "https://example.com/blog/?a=1")).toBe("example.com/blog?a=1");
    expect(linkSubtitle("website", "garbage/")).toBe("garbage");
    expect(linkSubtitle("github", "https://github.com/ada")).toBe("ada");
  });
});
