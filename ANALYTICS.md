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

This describes Omicron's built-in writer analytics. Operators can turn view
counting off or separately opt into [Umami Cloud](#optional-umami-cloud), which
has different privacy properties and is disabled by default.

---

## The two data sources

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
  **delivered to** from your outbox. This measures *our* sending, not anyone's
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
here. This is the only reader-side measurement in the system, and it is built to
the standard of privacy-preserving analytics (think Plausible/GoatCounter, not
Google Analytics).

How a view is counted:

1. A view counts **one reader per post, ever** — not once per day. The stored
   total is an **aggregate integer** — `(post_id, date, views)`, bucketed by the
   day a reader was *first* counted — with **no row representing an individual
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
pages served by *this* instance. We consider this a feature, not a gap:
surveilling the wider fediverse to inflate a number would betray the entire
point of the platform.

A writer's truest signal of reach is therefore fediverse **engagement**, not a
view count.

---

## What we never collect

Omicron's built-in writer analytics do **not**:

- Store reader IP addresses, or use browser fingerprinting.
- Set a cookie for any purpose other than recognising a returning anonymous
  reader well enough to avoid double-counting their view of the same post; that
  cookie holds a random value, never an IP, user-agent, or fingerprint, and is
  itself only ever stored as a one-way hash on the server.
- Send any data to third-party analytics, ad networks, or external services.
- Record per-visit event logs that could be mined later.
- Build demographic, interest, or behavioural profiles of readers.
- Track watch-time, scroll-depth, or read-completion of individuals.
- Show writers a list of *who* viewed a post, or any individual reader's history.

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

## Optional Umami Cloud

Admins can enable a separate website-statistics integration in **Admin →
Instance → Umami Cloud**. Paste either the website ID or the Cloud tracking
snippet, enable the switch and save. Only the UUID is stored: pasted HTML is
never executed and cannot choose an upstream server. Disable and save to stop
collection, retaining the ID; clear the field while disabled to remove it.
Changes apply without a restart or deployment configuration.

The browser fetches `/api/site/script.js` and sends pageviews to
`/api/site/api/send`. Omicron proxies those to the fixed Umami Cloud script and
gateway URLs, following Umami's ad-blocker proxy guidance. Same-origin proxying
can avoid domain blocklists, but does not guarantee that every blocker allows it.
The script is cached server-side for one hour; collection responses are never
cached. Disabled instances do not fetch the script or forward pageviews.

Only successful public reading pages are measured: home, profiles, articles,
tags, and the about/contact/privacy/status pages. Authentication, administration,
editing, dashboards, search and reading lists are excluded. Query strings and
fragments are removed. Internal referrers are limited to public paths; external
referrers are reduced to their origins. No account IDs, identification calls,
custom events, performance metrics or session replays are enabled. Both browser
and HTTP DNT/GPC signals are honoured, as is `localStorage['umami.disabled']`.

**Unlike built-in view counting, enabling Umami Cloud forwards visitor IP
addresses and browser information to a third-party processor**, along with
public page paths, titles and referrers. Umami uses these to derive anonymous
sessions and approximate geography without analytics cookies. This data does
not feed the writer dashboard. A disclosure appears on the instance's privacy
page even when the operator supplies a custom policy. The operator must review
Umami's privacy terms, update their policy and arrange any legally required
consent before enabling it; this integration is not a consent-management system.

---

## Who can see what

- **A writer** sees aggregate stats for **their own** posts and account only:
  view counts (if enabled on the instance), likes, boosts, replies, follower
  growth, and federated reach.
- **No writer** can see another writer's dashboard, and no writer can see
  individual reader identities.
- **Readers** are never shown anyone's analytics.

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

| | Collected? | Identifiable? | Opt-out |
| --- | --- | --- | --- |
| Fediverse likes / boosts / replies / follows | Yes (public activities) | Only the public actor that acted | n/a — public by nature |
| Federated reach (deliveries sent) | Yes | No | n/a |
| On-instance views (1 reader/post, lifetime, aggregate) | Yes, if enabled | No | Moderator switch + DNT/GPC |
| Anonymous reader cookie (random value, hashed before storage) | Yes, if enabled | No — one-way hash only | Moderator switch + DNT/GPC |
| Reader IPs, fingerprints, profiles | **Never** | — | — |

The table covers built-in writer analytics only, not the optional Umami Cloud
integration described above.

We count what happened. We never track who you are.
