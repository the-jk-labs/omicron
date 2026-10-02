// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test } from "vitest";
import {
  isLinkPlatform,
  LINK_PLATFORMS,
  linkDisplayText,
  linkLabel,
  MAX_LINK_LABEL_LEN,
  MAX_LINK_URL_LEN,
  MAX_PROFILE_LINKS,
  normalizeLinkUrl,
} from "@/lib/profileLinks.ts";

describe("isLinkPlatform", () => {
  test("accepts every whitelisted platform", () => {
    for (const p of LINK_PLATFORMS) expect(isLinkPlatform(p)).toBe(true);
  });

  test.for(["GitHub", "facebook", "", " github", "__proto__", "toString"])("rejects %j", (p) => {
    expect(isLinkPlatform(p)).toBe(false);
  });

  test.for([null, undefined, 1, {}, ["github"]])("rejects non-string %o", (p) => {
    expect(isLinkPlatform(p)).toBe(false);
  });
});

describe("linkLabel", () => {
  test("names known platforms", () => {
    expect(linkLabel("github")).toBe("GitHub");
    expect(linkLabel("youtube")).toBe("YouTube");
    expect(linkLabel("irc")).toBe("IRC");
  });

  test("labels the custom platform generically", () => {
    expect(linkLabel("custom")).toBe("Link");
  });

  test("uses the fallback for unknown platforms", () => {
    expect(linkLabel("myspace", "My Space")).toBe("My Space");
  });

  test("falls back to 'Link' when the fallback is empty", () => {
    expect(linkLabel("myspace")).toBe("Link");
    expect(linkLabel("myspace", "")).toBe("Link");
  });

  test("every platform has a non-empty label", () => {
    for (const p of LINK_PLATFORMS) expect(linkLabel(p).length).toBeGreaterThan(0);
  });
});

describe("linkDisplayText", () => {
  test.for([
    ["https://github.com/ada", "github.com/ada"],
    ["https://www.github.com/ada/", "github.com/ada"],
    ["https://example.com/", "example.com"],
    ["https://example.com", "example.com"],
    ["https://example.com/a?b=1#c", "example.com/a?b=1#c"],
    ["http://example.com:8080/x", "example.com:8080/x"],
    // Non-special schemes keep the fragment straight after the host.
    ["irc://irc.libera.chat/#omicron", "irc.libera.chat#omicron"],
  ])("%s -> %s", ([url, expected]) => {
    expect(linkDisplayText(url)).toBe(expected);
  });

  test("strips a scheme and trailing slash from an unparseable value", () => {
    expect(linkDisplayText("not a url/")).toBe("not a url");
  });
});

describe("normalizeLinkUrl", () => {
  test("adds https:// to a bare host", () => {
    expect(normalizeLinkUrl("github.com/ada")).toBe("https://github.com/ada");
  });

  test("keeps http and https as given", () => {
    expect(normalizeLinkUrl("http://example.com")).toBe("http://example.com/");
    expect(normalizeLinkUrl("HTTPS://Example.com/Path")).toBe("https://example.com/Path");
  });

  test("trims surrounding whitespace", () => {
    expect(normalizeLinkUrl("  https://example.com/x  ")).toBe("https://example.com/x");
  });

  test.for(["", "   "])("rejects blank input %j", (raw) => {
    expect(normalizeLinkUrl(raw)).toBe(null);
  });

  test.for([
    "javascript:alert(1)",
    "JavaScript:alert(document.cookie)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
  ])("never stores a dangerous scheme: %s", (raw) => {
    expect(normalizeLinkUrl(raw)).toBe(null);
  });

  test.for(["localhost", "https://localhost:3000", "intranet", "ftp://example.com"])(
    "rejects a dotless or non-web host: %s",
    (raw) => {
      expect(normalizeLinkUrl(raw)).toBe(null);
    },
  );

  test("accepts an XMPP JID and normalizes the scheme case", () => {
    expect(normalizeLinkUrl("xmpp:ada@jabber.org")).toBe("xmpp:ada@jabber.org");
    expect(normalizeLinkUrl("XMPP:ada@jabber.org")).toBe("xmpp:ada@jabber.org");
  });

  test.for(["xmpp:ada", "xmpp:@jabber.org", "xmpp:ada@localhost", "xmpp:a b@jabber.org", "xmpp:ada@jab/ber.org"])(
    "rejects a malformed JID %j",
    (raw) => {
      expect(normalizeLinkUrl(raw)).toBe(null);
    },
  );

  test("accepts irc and ircs URLs with a dotted host", () => {
    expect(normalizeLinkUrl("irc://irc.libera.chat/#omicron")).toBe("irc://irc.libera.chat/#omicron");
    expect(normalizeLinkUrl("ircs://irc.libera.chat:6697")).toBe("ircs://irc.libera.chat:6697");
  });

  test("rejects an IRC URL without a dotted host", () => {
    expect(normalizeLinkUrl("irc://localhost/#x")).toBe(null);
  });

  // BUG: an email address entered as a link ("mailto:…") is not rejected; the
  // "add https://" fallback turns it into a credentialed https URL pointing at
  // the mail domain, which is never what the user meant.
  test.fails("BUG: rejects a mailto: address instead of turning it into a credentialed https URL", () => {
    expect(normalizeLinkUrl("mailto:me@example.com")).toBe(null);
  });
});

test("limits are the documented values", () => {
  expect(MAX_PROFILE_LINKS).toBe(10);
  expect(MAX_LINK_URL_LEN).toBe(2048);
  expect(MAX_LINK_LABEL_LEN).toBe(60);
});
