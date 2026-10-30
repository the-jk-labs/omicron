# AGENTS.md — Omicron mobile

The Omicron app for Android and iOS: Expo SDK 58, React Native 0.88, React 19 (React Compiler on). Read the
repository-root `AGENTS.md` first; its safety, git, TDD and language rules apply here too. Visual rules are in
[STYLE.md](STYLE.md).

## Expo has changed — do not trust memory

Before touching an Expo, EAS or React Native API, read the SDK 58 docs (`https://docs.expo.dev/versions/v58.0.0/`,
or `https://docs.expo.dev/llms.txt`). Agent skills are pinned in `skills-lock.json`; restore them with
`pnpm install:skills` (they land in `.agents/`, which is git-ignored).

## Commands (pnpm only)

```sh
pnpm install
pnpm expo install <pkg>   # native modules: resolves the SDK-compatible version
pnpm start                # Metro, for a dev client (never Expo Go)
pnpm android              # build and run the dev client (APP_VARIANT=development)
pnpm editor:build         # rebuild the composer's WebView bundle (see "Composer")
pnpm icons                # render icons, splash and Play Store images from apps/frontend/src/lib/assets/omicron.svg
pnpm fmt && pnpm check    # tsc (app + editor bundle), oxfmt, oxlint, vitest, asset check
pnpm react-native-doctor  # React Doctor; keep it at 100
```

`ios/` and `android/` are generated (CNG). Configure native behaviour in `app.config.ts` and config plugins, never
by hand. Dev builds use id `blog.omicron.app.dev` and scheme `omicron-dev`; release uses `blog.omicron.app` and
`omicron`. The backend trusts both schemes (`apps/backend/src/auth/auth.ts`).

## Layout

```
src/app/            routes only (expo-router); screens stay thin and compose components
  welcome.tsx       first run: choose the instance
  (app)/            everything bound to one instance (InstanceProvider)
    (tabs)/         Home, Lists, Alerts, Profile + the custom tab bar
    (auth)/         sign in, register, forgot password (a modal stack)
src/components/ui/  the component kit (bits-ui look); see STYLE.md
src/components/<feature>/
src/lib/            no React components; hooks only where they wrap a library
  api/              client.ts (fetch, errors), endpoints.ts (port of apps/frontend/src/lib/api/index.ts)
  auth/             Better Auth client per instance, session hooks, password policy
  instance/         saved instance, origin helpers, discovery
  query/            QueryClient, persistence, keys, cache patching, feature query hooks
  network/          connectivity (expo-network + /healthz)
  html/             post HTML → native block tree, code highlighting
  editor/           composer bridge, autosave
  dialogs/          toast and confirm stores (their hosts live in components/ui)
editor-web/         the composer's WebView bundle (Vite), built into editor-web/build/editorHtml.js
tests/              mirrors src/ (vitest, Node; react-native is stubbed in tests/support)
```

## Rules

- **One instance at a time.** Auth, API client and query cache all come from `InstanceProvider`, mounted with
  `key={origin}`; switching instance remounts it. Never send a cookie or token to another origin. Root-relative
  media URLs go through `useInstance().media()`, which also proxies external images as the web does.
- **API types and schemas** come from `@omicron/contract` (`packages/contract`, linked; `pnpm install` there first).
  Every call in `src/lib/api/endpoints.ts` names its response schema, and the client checks the response with it
  (`src/lib/api/parse.ts`: `z.validate` first, `safeParse` only to find what to leave out). Never call `fetch` from a
  screen. Metro watches the package and resolves its zod from this app (`metro.config.js`).
- **External data is parsed with `zod/mini`** (stored JSON, discovery, health checks, error bodies, WebView
  messages): no `isRecord`-style helpers or casts.
- **All network goes through `react-native-nitro-fetch`**, Better Auth included (`customFetchImpl`). Transport
  failures become `NetworkError`.
- **Offline:** `src/lib/network` keeps TanStack's `onlineManager` in step with the device and the instance, so
  queries pause instead of failing and the persisted cache stays on screen. Loading states show `OfflineState`
  while paused. Don't bypass this with ad-hoc requests.
- **Query keys** live in `src/lib/query/keys.ts`. Optimistic updates of a post use `updatePostEverywhere` so every
  screen showing it agrees; roll back with the returned snapshot.
- **App Links:** `https://omicron.blog` links open in the app (`android.intentFilters` in `app.config.ts`, verified by
  the backend's `/.well-known/assetlinks.json`). `src/app/+native-intent.tsx` routes them through
  `resolveIncomingLink`; keep its path list and the intent filter in step.
- **Credential fields** (anything with a username, email, password or one-time-code `autoComplete`) spread
  `useAutofillFields()` onto the input. Without it, password managers stay silent on any pushed screen
  (`src/hooks/use-autofill-fields.ts` says why).
- **Sign-in is email/username + password** (Better Auth Expo, cookie in SecureStore). Passkeys are managed on the
  web for now (Settings → Account opens the instance's settings).
- **React Compiler:** no `try/finally` in components (it skips the whole component); reset busy flags on both
  paths instead. A `try/catch` in a component can't hold `?:`, `&&`, `??` or `?.` either: use `.then(ok, fail)` or
  move the work into a plain helper outside the component. Reanimated shared values use `.get()`/`.set()`, never `.value =` in component code.
- **Comments:** one line, two at most, only for the non-obvious why.

## Composer

The editor is the web's own Tiptap setup (`apps/frontend/src/lib/editor/extensions.ts`) running in a TenTap
WebView, so posts written here have exactly the web's HTML and JSON. `src/lib/editor/omicron-bridge.ts` is shared by
the app and the bundle (keep it free of native imports); native-only helpers go in `editor-commands.ts`. After
changing the bridge, the web extensions, or upgrading `@10play/tentap-editor` or Tiptap, run `pnpm editor:build`
and commit `editor-web/build/editorHtml.js`.

## Tests

We do test-driven development:

- **Bug reports:** first write a test that reproduces the bug and confirm it fails for the reported reason, then
  fix it and show the same test passing. If the test passes, the bug isn't reproduced: say so and change nothing.
- **Feature requests:** build the feature first, then write its tests (main flow, edge cases, failure paths). A
  feature isn't done until it's tested and `pnpm check` passes.

Logic lives in `src/lib` so it can be tested on Node. Native
modules are mocked in `tests/setup.ts`; `react-native` and `react-native-mmkv` are aliased to stand-ins in
`vitest.config.mts`.
