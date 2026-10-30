// Ported from apps/frontend/src/lib/autosave.svelte.ts, without Svelte runes: state changes are reported
// through `onChange`. A save happens when the author stops typing, and anyway if they never stop.

export type SaveState = "idle" | "saving" | "saved" | "error";

export type AutosaveSnapshot = { state: SaveState; savedAt: number | null; error: string | null; dirty: boolean };

export type AutosaveOptions = {
  /** Performs one save. Rejecting means it failed; the work stays dirty. */
  save: () => Promise<void>;
  /** False when there is nothing worth writing yet (an empty draft). */
  canSave: () => boolean;
  onChange?: (snapshot: AutosaveSnapshot) => void;
  /** Quiet period after the last change before saving. */
  idleMs?: number;
  /** Longest a change may sit unsaved while the author keeps typing. */
  maxMs?: number;
  /** Wait before re-trying a failed save. */
  retryMs?: number;
};

export class Autosave {
  state: SaveState = "idle";
  savedAt: number | null = null;
  error: string | null = null;
  dirty = false;

  private readonly opts: Required<Omit<AutosaveOptions, "onChange">> & Pick<AutosaveOptions, "onChange">;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped = false;
  // Bumped by every change: a save that lands on a stale generation leaves `dirty` set.
  private generation = 0;

  constructor(opts: AutosaveOptions) {
    this.opts = { idleMs: 2_000, maxMs: 30_000, retryMs: 15_000, ...opts };
  }

  private emit() {
    this.opts.onChange?.({ state: this.state, savedAt: this.savedAt, error: this.error, dirty: this.dirty });
  }

  /** Call on every author-visible change. */
  schedule(): void {
    if (this.stopped) return;
    this.dirty = true;
    this.generation++;
    if (this.state === "error") this.state = "idle";
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => void this.run(), this.opts.idleMs);
    // Started on the first change of a burst and left alone, so it measures time since the first unsaved change.
    this.maxTimer ??= setTimeout(() => void this.run(), this.opts.maxMs);
    this.emit();
  }

  /** Saves now if anything is pending, and resolves when it has landed. */
  async flush(): Promise<void> {
    if (this.inFlight) await this.inFlight;
    if (this.dirty) await this.run();
  }

  /** Stops scheduling, so a deliberate save (publish) can't race a timer. */
  stop(): void {
    this.stopped = true;
    this.clearTimers();
  }

  /** Re-enables scheduling after a `stop()` whose save failed. */
  resume(): void {
    this.stopped = false;
    if (this.dirty) this.schedule();
  }

  private clearTimers(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.maxTimer) clearTimeout(this.maxTimer);
    this.idleTimer = null;
    this.maxTimer = null;
  }

  private async run(): Promise<void> {
    this.clearTimers();
    if (this.stopped) return;
    // One request at a time: overlapping PATCHes can land out of order and resurrect an older body.
    if (this.inFlight) return this.inFlight;
    if (!this.dirty || !this.opts.canSave()) return;

    const generation = this.generation;
    let failed = false;
    this.state = "saving";
    this.emit();
    this.inFlight = (async () => {
      try {
        await this.opts.save();
        if (this.stopped) return;
        this.savedAt = Date.now();
        this.error = null;
        this.state = "saved";
        if (generation === this.generation) this.dirty = false;
      } catch (err) {
        if (this.stopped) return;
        failed = true;
        this.error = err instanceof Error ? err.message : "Failed to save.";
        this.state = "error";
      }
    })();

    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
    this.emit();
    if (this.stopped) return;
    // Edits made mid-request, or a failure to retry: back through the debounce, so a down server isn't hammered.
    if (this.dirty) {
      this.idleTimer = setTimeout(() => void this.run(), failed ? this.opts.retryMs : this.opts.idleMs);
    }
  }
}
