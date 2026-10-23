<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Analytics & the Writer Dashboard — How It Works

This is a transparency document. Omicron gives writers a dashboard (like a
privacy-respecting "Studio") so they can see how their work travels. We owe
**readers** an honest, plain-language account of what is and isn't measured to
make that dashboard exist.

Omicron is a federated, self-hostable, AGPL-3.0 blogging platform. Our north
star includes freedom of speech and **no surveillance of readers**. The
analytics here are designed around one rule:

> **We count what happened. We never track who you are.**

If you run your own instance, this describes the default behaviour of the
software. Operators can turn parts of it off (see [Operator controls](#operator-controls)),
but they cannot turn on anything described under [What we never collect](#what-we-never-collect)
without modifying the source — and because Omicron is AGPL, any such modified
version must publish its source to its users.

---

## The writer dashboard's two data sources

A writer's dashboard is built from two clearly separated sources. They have very
different privacy properties, so we keep them separate in the data model and in
this document.

### 1. Fediverse engagement (public, consensual actions)

When someone Likes, boosts, replies to, or follows you, that is a **public
ActivityPub activity** the person deliberately performed. It is addressed to
your inbox. Counting it is not surveillance — it is reading mail that was sent
to you on purpose.

We surface, per post and per account:

- **Likes** — `Like` activities (local and federated).
- **Boosts / reposts** — `Announce` activities.
- **Replies** — `Create`→`Note`/comment activities in reply to your post.
- **New followers** — `Follow` activities.
- **Federated reach** — how many remote inboxes/servers a post was successfully
  **delivered to** from your outbox. This measures _our_ sending, not anyone's
  reading.

These already flow through Omicron's federation layer and the existing
engagement repositories (`likes`, `comments`, `commentLikes`, `follows`). The
dashboard aggregates them; it does not collect anything new about the people who
performed them beyond what the fediverse already makes public (their actor
handle, which is part of the activity itself).

**What we do NOT do with engagement:** we do not build per-reader profiles,
correlate one person's likes across your posts into a behavioural history, or
expose "who is reading you." We show counts and the same public interactions any
fediverse client would show.

### 2. On-instance views (counted, never tracked)

For reads that happen **on this Omicron instance's own web pages**, we keep a
simple view count so a writer can see roughly how many times a post was opened
here. This is separate from the optional admin traffic dashboard below, and is built to
the standard of privacy-preserving analytics (think Plausible/GoatCounter, not
Google Analytics).

How a view is counted:

1. A view counts **one reader per post, ever** — not once per day. The stored
   total is an **aggregate integer** — `(post_id, date, views)`, bucketed by the
   day a reader was _first_ counted — with **no row representing an individual
   visit**. Refreshing, re-opening, or coming back next month to the same post
   never increases the count again, so the number can't be inflated by
   reloading or by a genuinely returning reader.
2. **No IP address is stored. No fingerprint is taken.** Signed-in readers are
   deduplicated by a one-way hash of their account id — nothing new is learned
   about them beyond what their account already implies. Anonymous readers are
   deduplicated by a one-way hash of a random, first-party cookie that carries
   **no IP, user-agent, or fingerprinting signal** — it recognises "the same
   browser came back," nothing more. A different browser or device is, by
   design, a different reader; we do not try to link them.
3. Both kinds of key are one-way hashed with a server-side secret before they
   ever touch storage. The raw account id, and the raw cookie value, are never
   written to disk — only the digest is.
4. Known bots and crawlers are filtered out, and neither a view nor a cookie is
   issued to them.
5. Time is bucketed no finer than **one day**. We never expose per-minute or
   per-visit timestamps, which protects low-traffic instances where a precise
   timestamp could hint at identity.

An on-instance view count **cannot be reversed into "who read this"**: the
digest doesn't reverse to the account id or cookie value, and there is no
per-visit log, IP, or fingerprint sitting alongside it to correlate against.

We count deduplicated readers rather than raw page hits on purpose: with no
reader accounts required to read (the whole point of the privacy model), a raw
hit counter would be trivially inflated by refreshing, so the honest,
refresh-proof number is "distinct readers per post." We make no claim to
YouTube-grade fraud detection — a determined actor clearing cookies and
rotating networks can still inflate an account-less metric; the goal is
resistance to casual inflation, not forensic accuracy.

---

## The federation reality (why most reads are invisible — and that's correct)

Your posts are read on Mastodon, other Omicron instances, RSS readers, and
ActivityPub apps all over the network. Omicron has **no visibility into those
reads and does not attempt to obtain any.** On-instance view counts only cover
pages served by _this_ instance. We consider this a feature, not a gap:
surveilling the wider fediverse to inflate a number would betray the entire
point of the platform.

A writer's truest signal of reach is therefore fediverse **engagement**, not a
view count.

---

## What we never collect

Regardless of operator settings, the stock software does **not**:

- Store reader IP addresses, or use browser fingerprinting.
- Set analytics cookies other than random first-party tokens used for post-read
  de-duplication, containing no IP, user-agent or fingerprint. The separate site
  traffic collector sets no cookies and creates no browser/session identifiers.
- Send any data to third-party analytics, ad networks, or external services.
- Record per-visit event logs that could be mined later.
- Build demographic, interest, or behavioural profiles of readers.
- Track watch-time, scroll-depth, or read-completion of individuals.
- Show writers a list of _who_ viewed a post, or any individual reader's history.

---

## Operator controls

On-instance view counting is **opt-out at the instance level** and is controlled
by the instance's moderators/administrators (accounts with `is_admin`), not by
individual writers wanting more data about readers.

- There is a single instance setting, e.g. `analytics.onInstanceViews`, that a
  moderator can switch **off**. When off, no view counters are incremented and
  the dashboard simply omits the on-instance views panel.
- **Fediverse engagement counts are always available** — they are public
  activities sent to you, not reader tracking, so there is nothing to opt out of.
- Reader-respecting signals **Do Not Track** (`DNT`) and **Global Privacy
  Control** (`Sec-GPC`) are honoured: a request carrying either is never counted,
  even when view counting is enabled.

Per-instance self-hosting means each community sets its own posture: a privacy-
maximalist instance can run with on-instance views off and show writers only
fediverse engagement.

---

## Who can see what

- **A writer** sees aggregate stats for **their own** posts and account only:
  view counts (if enabled on the instance), likes, boosts, replies, follower
  growth, and federated reach.
- **No writer** can see another writer's dashboard, and no writer can see
  individual reader identities.
- **Readers** are never shown anyone's analytics.
- **Admins** can enable and see the instance's aggregate site-traffic dashboard.
  Moderators and ordinary writers cannot access it. It exposes no reader list.

## Optional site traffic dashboard

**Admin → Traffic** is a separate, first-party measurement system, disabled by
default. It does not change the writer dashboard's lifetime post-read definition.
Before enabling it, the operator must update their privacy notice and arrange
any consent required by their jurisdiction. The software does not provide a
consent-management platform. The built-in privacy page always describes this
feature, including alongside an operator-supplied policy.

### What the numbers mean

- **Pageviews:** successful, visible loads and SPA navigations on the public
  home, information, search, tag, public reading-list, profile and post pages
  (including cached federated profiles/posts). Refreshes
  count again. Hash/query-only changes do not. Search terms are never collected.
- **No unique visitor or visit counts:** the collector does not identify browsers
  or sessions. Pageviews are not people, and repeat loads are counted again.
  The dashboard reports pageview growth, not audience-size estimates.
- **Breakdowns:** pageviews by public path, referring hostname, country (when
  configured), and broad device/browser/OS name. Versions, raw user agents,
  referrer paths, query strings and fragments are not retained. Referrers are
  per pageview, not a person's journey; internal and absent referrers share a
  `Direct / internal` bucket.

Known bots, signed-in admins/moderators, private/unpublished/withdrawn local
content, account/admin routes, assets, APIs, federation requests and feeds are
excluded by the web collector. The backend also excludes any authenticated staff
request it receives. DNT and GPC prevent counting. JavaScript
must be available; blocked requests and unidentified bots affect accuracy. This
measures the web audience, **not all HTTP requests**, bandwidth, cache hits or
Cloudflare data-center traffic. It cannot reconstruct earlier traffic.

### Counting without a visitor database

Only `(day, dimension, value, pageviews)` aggregates are retained. Dimensions
are independent counters, not rows linking a page, country and device to one
reader. Monthly and range totals are sums of pageviews, not deduplicated people.

Site traffic does not set or read analytics cookies, use browser storage, create
browser/session IDs, fingerprint devices, or hash IPs into identifiers. The
collector omits credentials and the automatic Referer header; its only payload
is a pathname and referring origin. Existing sign-in and writer-reader cookies
are not sent with traffic measurements. The writer dashboard remains a separate
feature with its existing post-read cookie and de-duplication model.

The collector bounds queued SPA requests and does not retry failed measurements.
Same-origin checks, a capped request body,
rate limiting, server-side public-content validation, and a transactional cap of
500 values per dimension per day limit abuse and storage growth. Overflow goes
to `Other (daily limit)`. Like any browser-based analytics, this is not a fraud
detection system: a determined client can forge events.

Daily aggregates are retained for **730 days**, pruned daily, including while
collection is disabled. Queries cover 1–365 inclusive UTC dates, with the adjacent
equal-length period as comparison. Today and the current month are incomplete;
monthly groups at range boundaries can be partial. Missing collection history
must not be mistaken for zero real-world traffic. Turning collection off leaves
historical aggregates readable and stops new measurements. This feature issues
no cookies to expire or remove.

### Optional local geography

Set `TRAFFIC_GEOIP_PATH` to a local MaxMind-compatible Country/City `.mmdb` file.
No external IP lookup is performed, and no IP or precise location is retained.
Only `country.iso_code` is aggregated. Without a readable database, the dashboard
explains that geography is unavailable, rather than inventing country figures.
Unknown historical countries cannot be backfilled. Database initialization
failures disable geography until restart; atomic replacements of a successfully
loaded database are watched automatically.

In Compose, mount an operator-managed database directory read-only using a
separate override file, for example:

```yaml
services:
  backend:
    volumes:
      - ./geoip:/data/geoip:ro
```

Then set `TRAFFIC_GEOIP_PATH=/data/geoip/country.mmdb` in `.env` and recreate the
backend with that override. Acquire and update the database under its provider's
license; Omicron does not download it. The trusted proxy chain must forward the
real connection address correctly. A CDN/proxy address otherwise locates that
proxy, not the visitor. Client-supplied country headers are never used. Country
is an approximate network location, affected by VPNs, not a claim of residence.

### API and deployment

- `POST /api/traffic/pageview`: same-origin browser collection, no sign-in
  required; `{ path, referrer? }`. Accepted/skipped events return `204`, malformed
  bodies `400`, oversized bodies `413`, throttled requests `429`. Storage failure
  is best-effort and does not interrupt navigation.
- `GET /api/admin/traffic?from=YYYY-MM-DD&to=YYYY-MM-DD`: admin-only aggregate
  totals, previous-period totals, zero-filled daily and merged monthly series,
  top breakdowns, and measurement status. Defaults to the last 30 UTC dates.
- `PUT /api/admin/traffic/settings`: admin-only `{ enabled: boolean }`.
- `/api/instance` adds `trafficEnabled`, so pages do not send measurements while
  collection is disabled. Already-open pages adopt enablement on their next
  layout reload; the server always enforces disabling immediately.

The startup migration sequence creates `traffic_buckets` in
`0044_daily_gateway.sql`, then removes unused visitor/visit sketch columns in
`0045_cookieless_traffic.sql`, preserving pageview counters. Take and verify the
normal instance backup before deploying any migration. No Caddy changes, external
analytics account, or extra service is required. Geography alone needs the
optional database mount and backend restart.

## Retention

- Aggregate counters are kept as small per-day integers and may be summarised
  into coarser buckets over time. There is no per-visit log to retain or expire.
- De-duplication keys (the hashed account id or hashed anonymous cookie, per
  post) are kept **permanently**, since permanence is what makes "one view per
  reader, ever" possible. They still carry no raw IP, user-agent, or per-visit
  timestamp — only an opaque digest tied to a post id.

---

## Where this lives in the code

For contributors, the implementation follows Omicron's layered architecture:

- `db/` — an analytics repository plus an aggregate counters table
  (per-post, per-day). No per-visit table exists by design.
- `federation/` — engagement counters derive from inbound `Like` / `Announce` /
  `Follow` / reply handling; federated reach is captured on the outbox delivery
  side.
- `services/` — an analytics service aggregates repository data into the
  dashboard view model (alongside the existing `engagement.ts`).
- `routes/` — a thin authenticated dashboard endpoint that returns only the
  requesting author's own data, and that respects the instance opt-out setting
  plus `DNT` / `Sec-GPC`.

---

## Summary

|                                                                | Collected?                  | Identifiable?                    | Opt-out                    |
| -------------------------------------------------------------- | --------------------------- | -------------------------------- | -------------------------- |
| Fediverse likes / boosts / replies / follows                   | Yes (public activities)     | Only the public actor that acted | n/a — public by nature     |
| Federated reach (deliveries sent)                              | Yes                         | No                               | n/a                        |
| On-instance views (1 reader/post, lifetime, aggregate)         | Yes, if enabled             | No                               | Moderator switch + DNT/GPC |
| Anonymous reader cookie (random value, hashed before storage)  | Yes, if enabled             | No — one-way hash only           | Moderator switch + DNT/GPC |
| Reader IPs, fingerprints, profiles                             | **Never**                   | —                                | —                          |
| Site traffic (cookieless daily pageview counters)              | Only if an admin enables it | No browser IDs or event log      | Admin switch + DNT/GPC     |

We count what happened. We never track who you are.
