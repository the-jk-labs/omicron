# Development Guide

## Prerequisites

- JDK 17
- Android SDK Platform 36
- A connected Android device or emulator for device validation when a change affects runtime behavior

## Local Quality Gate

Run the same baseline checks as CI before requesting review:

```sh
./gradlew :composeApp:assembleDebug :composeApp:lintDebug :composeApp:testDebugUnitTest
```

Install a debug build on a connected device when applicable:

```sh
./gradlew :composeApp:installDebug
```

Run connected Compose UI tests on a device when a critical journey changes:

```sh
./gradlew :composeApp:connectedDebugAndroidTest
```

The app package is `org.omicron.mobile`.

## Release And Performance Validation

Build and lint the optimized release variant:

```sh
./gradlew :composeApp:assembleRelease :composeApp:lintRelease
```

Collect a release baseline profile and run the cold-start benchmark on a connected Android device:

```sh
./gradlew :composeApp:generateReleaseBaselineProfile
./gradlew :baselineprofile:connectedBenchmarkReleaseAndroidTest
```

These instrumentation tasks use the isolated `org.omicron.mobile.baselineprofile` application ID for their target variants and may remove that temporary package when they finish. They must not remove or clear `org.omicron.mobile`; verify the production package remains installed after a connected run. The cold-start benchmark installs the generated profile and precompiles the isolated target before measuring it, preserving that compiled state during the benchmark. If the device cannot clear the shader cache through ProfileInstaller, the benchmark logs the limitation and continues; interpret results as cold process/kernel-cache startup with the device shader cache potentially warm.

## Delivery Workflow

1. Select the roadmap release and exit criterion the change advances.
2. Read `AGENTS.md`, `docs/architecture.md`, and the applicable Omicron server or web source of truth.
3. Record an API gap before implementing behavior the server does not confirm.
4. Keep the change within the selected release. Add an ADR for durable technical decisions.
5. Add or update focused tests with the implementation.
6. Update the roadmap, README, architecture docs, or ADRs when shipped behavior or a release gate changes.
7. Run the quality gate, inspect the diff, and create a focused conventional commit.

## Dependency Updates

- Use `gradle/libs.versions.toml` as the only version catalog.
- Check current stable releases and Android/AGP compatibility before pinning a dependency.
- Add a dependency only with the feature that uses it and document durable implications in an ADR when necessary.
- Keep generated RikkaUI primitives under `core/designsystem/rikkaui`; add them with the RikkaUI CLI before use.

## Pull Requests

Pull requests must identify the roadmap release, user-visible behavior, API contract source, verification run, and any unverified device behavior. Do not hide scope expansion in refactors or unrelated cleanup.

CI is the baseline merge requirement. If a required check cannot run, explain why, state the risk, and add a concrete follow-up before merge.
