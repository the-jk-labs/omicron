# Signed federation integration fixture

Run from `apps/backend`, with `DATABASE_URL` pointing only at a **throwaway**
PostgreSQL database:

```sh
pnpm test:integration tests/integration/signedFederation.test.ts
```

The database role needs `CREATEDB` in addition to the integration suite's ordinary
privileges. CI's disposable PostgreSQL service already provides this. The fixture
creates two databases named `omicron_fed_<random UUID>`, applies the committed
migrations, then drops only those generated databases after stopping its children.
It never migrates or truncates the database named by the parent URL. Other
integration files still truncate that parent database, so it must be disposable.

`Instances` starts two independent Vitest child processes using `instance.config.ts`.
Each loads the assembled Omicron application, real job handlers and Fedify queues,
a real key-pair dispatcher, its own database, and temporary uploads/state. The
servers bind only to loopback on automatically assigned ports. Their test-only
control routes require a per-process random token and are not part of the app.
Follower edges are seeded through the real repository; the Follow/Accept handshake
is not evaluated by these tests.

The factory adapter permits private addresses **only inside the child fixture**,
and a pass-through fetch guard refuses non-loopback HTTP traffic. It refuses to
start if production code disables signature verification. No inbox listener,
serializer, repository, signing operation, or verification result is mocked.
Queue processing uses the real in-process backend and an abort signal for teardown;
Redis persistence/retry durability is outside this fixture.

The tests exercise API publishing, signed Create/Update receipt, receiver SQL and
reader responses, image-byte availability, both directions, duplicate delivery,
and rejection of unsigned, wrong-signer, modified-body and stale requests. Both
Cavage and RFC 9421 signing are tested. A validly signed restricted Article is
ignored, with a later public activity acting as a processing barrier.

These checks do not evaluate public DNS/TLS, production proxies, other fediverse
implementations, arbitrary HTML, screen readers, or WCAG/ATAG conformance.
