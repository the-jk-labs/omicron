import { countLabel, excerpt } from "$lib/format";
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Regression tests for Markdown syntax leaking into the excerpt (the bug
// reported as "#UserID The user ID from our entry in the password file" and
// "#ProcandprocID An executing instance"). `excerpt` derives its text from
// rendered HTML; a heading written without the space after `#` is not a
// heading, so the `#` survives into the plain text. These tests pin that the
// marker is dropped — on every section, not just the first — while a genuine
// `#` in code or mid-prose is kept. The `countLabel` tests guard the reaction
// counters ("2 0 0" on cards, "5 0 0" on the post page) that once rendered as
// bare numbers: the phrase has to agree in number, or the tooltip and
// screen-reader label would read as broken English.
import { describe, expect, it } from "vitest";

describe("excerpt", () => {
  it("drops a heading marker the renderer leaves literal", () => {
    expect(excerpt("<p>#UserID The user ID from our entry in the password file</p>")).toBe(
      "UserID The user ID from our entry in the password file",
    );
  });

  it("drops the marker on every section, not just the first", () => {
    const out = excerpt("<p>#UserID The user id</p><p>#ProcandprocID An executing instance</p>");
    expect(out).toBe("UserID The user id ProcandprocID An executing instance");
    expect(out).not.toContain("#");
  });

  it("keeps a hash inside a code fence", () => {
    const out = excerpt('<p>#NAME proc</p><pre><code class="language-c">#include &lt;sys/types.h&gt;</code></pre>');
    expect(out).toContain("#include <sys/types.h>");
  });

  it("keeps a hash mid-prose", () => {
    expect(excerpt("<p>Read about the #UserID field here</p>")).toContain("#UserID");
  });
});

describe("countLabel", () => {
  it("uses the singular form only for one", () => {
    expect(countLabel(1, "like")).toBe("1 like");
    expect(countLabel(1, "response")).toBe("1 response");
    expect(countLabel(1, "recommendation")).toBe("1 recommendation");
  });

  it("uses the plural form for zero and for many", () => {
    expect(countLabel(0, "like")).toBe("0 likes");
    expect(countLabel(2, "like")).toBe("2 likes");
    expect(countLabel(0, "response")).toBe("0 responses");
    expect(countLabel(5, "response")).toBe("5 responses");
    expect(countLabel(0, "recommendation")).toBe("0 recommendations");
    expect(countLabel(3, "recommendation")).toBe("3 recommendations");
  });

  it("honours an explicit irregular plural", () => {
    expect(countLabel(1, "ox", "oxen")).toBe("1 ox");
    expect(countLabel(2, "ox", "oxen")).toBe("2 oxen");
  });
});
