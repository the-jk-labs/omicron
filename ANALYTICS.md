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

1. A view counts **one reader per post per day**. The stored data is an
   **aggregate integer** — `(post_id, date, views)` — with **no row representing
   an individual visit**. Refreshing or re-opening a post the same day does
   **not** increase the count, so the number can't be inflated by reloading.
2. **No IP address is stored. No cookie is set. No fingerprint is taken.**
3. To deduplicate within a day, a visit is reduced to a one-way hash of
   `IP + User-Agent + a server-side salt that rotates every day`. Only the hash
   is used, only to recognise a repeat read within that single day, and **the
   salt is discarded at midnight** — after which no hash can ever be linked back
   to a visitor. The raw IP is never written to disk.
4. Known bots and crawlers are filtered out so counts reflect people.
5. Time is bucketed no finer than **one day**. We never expose per-minute or
   per-visit timestamps, which protects low-traffic instances where a precise
   timestamp could hint at identity.

Because identity is never recorded in the first place, an on-instance view count
**cannot be reversed into "who read this."** There is nothing to subpoena,
breach, or sell, because the data does not exist.

We count deduplicated readers rather than raw page hits on purpose: with no
reader accounts (the whole point of the privacy model) a raw hit counter would
be trivially inflated by refreshing, so the honest, refresh-proof number is
"distinct readers per day." We make no claim to YouTube-grade fraud detection —
a determined actor rotating networks can still skew any account-less metric; the
goal is resistance to casual inflation, not forensic accuracy.

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

Regardless of operator settings, the stock software does **not**:

- Store reader IP addresses or any persistent reader identifier.
- Set tracking cookies or use browser fingerprinting.
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
- The daily de-duplication salt is **ephemeral** and rotated/discarded every day.

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
| On-instance views (1 reader/post/day, aggregate) | Yes, if enabled | No | Moderator switch + DNT/GPC |
| Reader IPs, cookies, fingerprints, profiles | **Never** | — | — |

We count what happened. We never track who you are.
