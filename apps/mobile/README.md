# Omicron for Android and iOS

The mobile app for [Omicron](https://github.com/the-jk-labs/omicron), the federated, self-hostable blogging
platform. It connects to any Omicron instance (omicron.blog is offered first) and covers what the web app does:
reading, writing, following, lists, notifications, settings and moderation.

Built with Expo SDK 58 and React Native. No Google Play Services.

## Develop

Requires Node 24.22+, pnpm 12, and Android Studio (or Xcode) for a development build.

```sh
pnpm install
pnpm android          # builds and installs the dev client (blog.omicron.app.dev)
pnpm start            # Metro for an installed dev client
pnpm fmt && pnpm check
```

The composer's editor is a small web bundle built from `editor-web/`: run `pnpm editor:build` after changing it.

Builds and over-the-air updates use EAS (`eas.json`). Set `EAS_PROJECT_ID` (from `eas init`) to enable updates.

Contributors and coding agents: read [AGENTS.md](AGENTS.md) and [STYLE.md](STYLE.md).

## License

AGPL-3.0-or-later, like the rest of Omicron. See [LICENSE](../../LICENSE).
