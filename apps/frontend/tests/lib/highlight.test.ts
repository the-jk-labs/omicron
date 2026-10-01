import { highlightCodeBlocks } from "$lib/highlight";
// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The reader-side highlighter runs at read time over stored HTML. These tests
// pin the contract per block kind: a declared language always highlights and
// captions, a confident guess highlights without a caption (a caption would
// present a guess as the author's fact), prose in a bare fence stays plain,
// and the shell-command transcript — which relevance alone cannot vouch for,
// since `sudo dnf install …` scores below an English sentence — is rescued by
// the stopword guard rather than by a lower global threshold.
import { describe, expect, it } from "vitest";

const wrap = (code: string, codeAttrs = "", preAttrs = "") => `<pre${preAttrs}><code${codeAttrs}>${code}</code></pre>`;

describe("highlightCodeBlocks", () => {
  it("highlights and captions a declared language", () => {
    const out = highlightCodeBlocks(wrap("const x = 1", ' class="language-typescript"'));
    expect(out).toContain('class="hljs language-typescript"');
    expect(out).toContain("<figcaption");
    expect(out).toContain("TypeScript");
  });

  it("highlights a declared language the common bundle does not carry", () => {
    const out = highlightCodeBlocks(wrap("FROM node:20-alpine\nRUN pnpm install", ' class="language-dockerfile"'));
    expect(out).toContain('class="hljs language-dockerfile"');
  });

  it("captions an unregistered declared language without highlighting", () => {
    const out = highlightCodeBlocks(wrap("let x = 1", ' class="language-nim"'));
    expect(out).not.toContain("hljs");
    expect(out).toContain("Nim");
  });

  it("colors a bare shell command transcript and does not caption the guess", () => {
    const src = "sudo dnf install -y openssh-server\nsudo systemctl enable --now sshd";
    const out = highlightCodeBlocks(wrap(src));
    expect(out).toContain('class="hljs language-bash"');
    expect(out).not.toContain("<figcaption");
  });

  it("colors a single low-scoring command line", () => {
    const out = highlightCodeBlocks(wrap("sudo firewall-cmd --permanent --add-service=ssh"));
    expect(out).toContain('class="hljs language-bash"');
  });

  it("leaves English prose in a bare fence plain", () => {
    const src = "If it shows enabled we can do our next step. For now, we need to control it in our private network.";
    const out = highlightCodeBlocks(wrap(src));
    expect(out).toBe(wrap(src));
  });

  it("leaves a block with no shell signal plain", () => {
    const src = "hostname -I";
    const out = highlightCodeBlocks(wrap(src));
    expect(out).toBe(wrap(src));
  });

  it("keeps the filename caption on an empty block", () => {
    const out = highlightCodeBlocks(wrap("\n", "", ' data-title="notes.txt"'));
    expect(out).toContain('data-title="notes.txt"');
    expect(out).toContain("<figcaption");
  });
});
