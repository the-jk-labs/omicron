// SPDX-License-Identifier: AGPL-3.0-or-later

// Debounced autosave for the composer.
//
// The rule this encodes: a save happens when the author stops typing, and it
// happens *anyway* if they never stop. Idle-only debouncing loses an hour of
// continuous writing to one closed tab, and interval-only saving writes a
// half-finished sentence to the server every tick. Both timers run together —
// whichever comes first wins.
//
// Deliberately unaware of what it is saving: it owns the timers, the
// in-flight/dirty bookkeeping and the retry, and the caller owns the request.

export type SaveState = "idle" | "saving" | "saved" | "error";

export interface AutosaveOptions {
  /** Performs one save. Rejecting means it failed; the work stays dirty. */
  save: () => Promise<void>;
  /** False when there is nothing worth writing yet (an empty draft). */
  canSave: () => boolean;
  /** Quiet period after the last change before saving. */
  idleMs?: number;
  /** Longest a change may sit unsaved while the author keeps typing. */
  maxMs?: number;
  /** Wait before re-trying a failed save. */
  retryMs?: number;
}

export class Autosave {
  /** What the status indicator shows. */
  state = $state<SaveState>("idle");
  /** When the last successful save landed, as epoch ms. */
  savedAt = $state<number | null>(null);
  /** Message from the last failure, cleared by the next success. */
  error = $state<string | null>(null);
  /** True while there are changes the server has not acknowledged. */
  dirty = $state(false);

  #opts: Required<AutosaveOptions>;
  #idleTimer: ReturnType<typeof setTimeout> | null = null;
  #maxTimer: ReturnType<typeof setTimeout> | null = null;
  #inFlight: Promise<void> | null = null;
  #stopped = false;
  // Bumped by every change. A save that finishes on a stale generation leaves
  // `dirty` set, so an edit made *during* the request is not marked saved.
  #generation = 0;

  constructor(opts: AutosaveOptions) {
    this.#opts = {
      idleMs: 2_000,
      maxMs: 30_000,
      retryMs: 15_000,
      ...opts,
    };
  }

  /** Call on every author-visible change. */
  schedule(): void {
    if (this.#stopped) return;
    this.dirty = true;
    this.#generation++;
    // A pending failure is superseded by the new edit: the retry it scheduled
    // would send the same body this run is about to replace.
    if (this.state === "error") this.state = "idle";

    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    this.#idleTimer = setTimeout(() => this.#run(), this.#opts.idleMs);
    // Started on the first change of a burst and left alone afterwards, so it
    // measures time-since-first-unsaved-change rather than resetting with the
    // idle timer and never firing.
    this.#maxTimer ??= setTimeout(() => this.#run(), this.#opts.maxMs);
  }

  /**
   * Saves now if anything is pending, and resolves when it has landed. Used
   * before deliberately leaving the editor.
   */
  async flush(): Promise<void> {
    if (this.#inFlight) await this.#inFlight;
    if (this.dirty) await this.#run();
  }

  /**
   * Stops scheduling permanently. The page calls this once it is committing a
   * save of its own (publish, explicit "Save draft"), so a timer cannot fire a
   * competing write into the same post, and on destroy.
   */
  stop(): void {
    this.#stopped = true;
    this.#clearTimers();
  }

  /**
   * Re-enables scheduling after a `stop()` that turned out to be temporary —
   * the publish the page stopped for failed, and the author is still writing.
   */
  resume(): void {
    this.#stopped = false;
    if (this.dirty) this.schedule();
  }

  #clearTimers(): void {
    if (this.#idleTimer) clearTimeout(this.#idleTimer);
    if (this.#maxTimer) clearTimeout(this.#maxTimer);
    this.#idleTimer = null;
    this.#maxTimer = null;
  }

  async #run(): Promise<void> {
    this.#clearTimers();
    if (this.#stopped) return;
    // One request at a time: two overlapping PATCHes of the same post can land
    // out of order and resurrect the older body.
    if (this.#inFlight) return this.#inFlight;
    if (!this.dirty || !this.#opts.canSave()) return;

    const generation = this.#generation;
    let failed = false;
    this.state = "saving";
    this.#inFlight = (async () => {
      try {
        await this.#opts.save();
        if (this.#stopped) return;
        this.savedAt = Date.now();
        this.error = null;
        this.state = "saved";
        if (generation === this.#generation) this.dirty = false;
      } catch (err) {
        if (this.#stopped) return;
        failed = true;
        this.error = err instanceof Error ? err.message : "Failed to save.";
        this.state = "error";
      }
    })();

    try {
      await this.#inFlight;
    } finally {
      this.#inFlight = null;
    }
    if (this.#stopped) return;
    // Changes that arrived mid-request, or a failure to re-try. Either way the
    // next attempt goes through the normal idle debounce rather than
    // immediately, so a server that is down is not hammered.
    if (this.dirty) {
      this.#idleTimer = setTimeout(
        () => this.#run(),
        failed ? this.#opts.retryMs : this.#opts.idleMs,
      );
    }
  }
}
