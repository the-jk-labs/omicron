# ADR-0008: Client-Side Syntax Highlighting With SnipMe Highlights

**Status:** Accepted

## Context

API `contentHtml` carries no highlight markup: highlighting runs in the web frontend's server load (`highlightCodeBlocks` in `apps/frontend/src/lib/highlight.ts`), not in the API serializers. The mobile reader must therefore highlight fenced code blocks itself. A WebView is excluded by the product boundary, so the highlighter must run in `commonMain` Kotlin and render into `AnnotatedString`.

## Decision

Use `dev.snipme:highlights:1.0.0` (Apache-2.0, pure-Kotlin KMP engine). Version 1.1.0 is skipped deliberately: its JVM artifact ships Java 21 bytecode, which the project's JDK 17 baseline cannot run, while 1.0.0 targets Java 8 with an identical highlighting API. Map its `CodeStructure` fields onto the web six-hue palette, tokenized as code colors in `OmicronTheme`: comments, keywords, strings, literals, and metadata-as-type. Highlighting runs off the main thread with plain monospace as the immediate value. Declared languages resolve through an alias table to `SyntaxLanguage`; undeclared or uncovered languages (including the picker's Dockerfile/Elixir/Haskell/PowerShell/Scala extras) render plain, mirroring the web low-confidence fallback.

## Consequences

- One new version-catalog dependency, introduced with this feature and usable from any future target.
- Narrower language coverage than highlight.js and no auto-detection; unknown code stays readable plain text instead of guessed colors.
- Release shrinking must keep passing with the new dependency on the classpath.

## References

- R2 in `roadmap.md`
- `apps/frontend/src/lib/highlight.ts` and `.prose-omicron .hljs-*` in `apps/frontend/src/app.css`
- `RENDERABLE_POST_TAGS` and `allowedClasses` in `apps/backend/src/lib/sanitize.ts`
- `https://github.com/SnipMeDev/Highlights`
