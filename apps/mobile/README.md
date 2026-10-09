# Omicron for Android

The Android client for [Omicron](https://github.com/the-jk-labs/omicron), a federated and self-hostable ActivityPub blogging platform.

This repository contains the Android-first Kotlin Multiplatform client. Android is the only active target; shared application code belongs in `composeApp/src/commonMain` so a future target can be introduced without relocating product code.

## Requirements

- JDK 17
- Android SDK Platform 36

## Build

```sh
./gradlew :composeApp:assembleDebug
./gradlew :composeApp:lintDebug
./gradlew :composeApp:testDebugUnitTest
```

## Development

- [Development guide](docs/development.md): setup, workflow, verification, and pull requests.
- [Architecture](docs/architecture.md): package boundaries, state, networking, persistence, and UI conventions.
- [Roadmap](roadmap.md): ordered releases, exit criteria, and API constraints.
- [Decision records](docs/adr/README.md): durable technical decisions and their rationale.

## Current Capability

- Connect to an HTTPS Omicron instance, defaulting to `https://omicron.blog`.
- Retrieve and retain public instance metadata from `GET /api/instance`.
- Present loading, invalid-address, unreachable, and retry states for instance connection.
- Sign in, register, and restore sessions with per-origin credential storage.
- Browse Global/Local timelines and the signed-in For you feed; read posts natively.
- Like, recommend, save, comment, follow, mute, and block with optimistic rollback.
- Search articles, tags, and people; browse tag pages, trending posts, topics, and suggested people.
- Compose and schedule posts, then manage drafts, scheduled posts, and published posts from the owner profile.
- Change the connected instance, persist a System/Light/Dark appearance choice, view app information, and sign out in Settings.
- Reopen previously loaded public articles offline from Settings and remove cached copies by instance.

Licensed font assets and release hardening remain outstanding. See [roadmap.md](roadmap.md).

## Repository Rules

`AGENTS.md` is required reading for contributors and coding agents. It defines the source of truth, design system, architecture, API rules, and quality bar for this client.

## License

AGPL-3.0-or-later. See the [root license](../../LICENSE).
