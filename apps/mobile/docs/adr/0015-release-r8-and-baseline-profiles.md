# ADR-0015: Release R8 And Baseline Profiles

**Status:** Accepted

## Context

The Android app uses Kotlin Multiplatform 2.4.20 with `androidTarget()` and the Android application plugin in one module. AGP 8.13.2's embedded R8 reports that it cannot parse Kotlin 2.4 metadata. Moving to AGP 9 requires a larger Kotlin Multiplatform project-structure migration, so it is outside the R6 release-readiness scope. Startup profile generation and cold-start measurement are also required release gates.

## Decision

- Keep AGP 8.13.2 and Gradle 8.14.5 for the current Kotlin Multiplatform application structure. Override AGP's embedded shrinker with stable R8 9.5.23 through the `pluginManagement` buildscript classpath in `settings.gradle.kts`.
- Use AndroidX Baseline Profile and Macrobenchmark 1.5.0 in the dedicated `:baselineprofile` module. Collect startup profiles for the app, merge generated profiles into release variants, and include ProfileInstaller 1.4.1 in the Android app. Give the `benchmarkRelease` and `nonMinifiedRelease` target variants the isolated application ID `org.omicron.mobile.baselineprofile` so connected instrumentation does not replace the production installation. The cold-start test explicitly installs the profile and invokes `speed-profile` compilation before using `CompilationMode.Ignore` to preserve that compiled state. Shader-cache broadcast failure is non-fatal for this benchmark.

## Consequences

- The app can use a Kotlin-metadata-capable R8 without taking on an AGP 9 migration in R6. Recheck the override when upgrading AGP; the newer R8 may fall back from asynchronous class parsing with AGP 8.13.2.
- Baseline profile generation and macrobenchmarks require connected instrumentation. Some OEM builds delay ProfileInstaller broadcasts for never-launched or force-stopped packages; the benchmark launches the isolated target, installs the profile, and compiles it before measurement. The runner may remove the isolated `.baselineprofile` package when it finishes; it must leave `org.omicron.mobile` and its data untouched.
- Macrobenchmark tolerates a failed shader-cache drop broadcast on unsupported OEM builds. Startup timings still include cold process and kernel-page-cache behavior, but may use an existing GPU shader cache.
- Building the benchmark APK validates its source and configuration but does not substitute for collecting a profile or recording a device startup measurement.

## References

- R6 in `roadmap.md`
- `docs/architecture.md`
- `docs/development.md`
- [R8 README: replacing R8 in the Android Gradle plugin](https://r8.googlesource.com/r8/+/refs/heads/main/README.md)
- [Kotlin Multiplatform compatibility guide](https://kotlinlang.org/docs/multiplatform/multiplatform-compatibility-guide.html)
