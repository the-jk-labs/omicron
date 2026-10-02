import { Autosave } from "$lib/autosave.svelte";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(opts: { canSave?: () => boolean; save?: () => Promise<void> } = {}) {
  const save = vi.fn<() => Promise<void>>(opts.save ?? (async () => {}));
  const autosave = new Autosave({
    save,
    canSave: opts.canSave ?? (() => true),
    idleMs: 100,
    maxMs: 1000,
    retryMs: 500,
  });
  return { save, autosave };
}

describe("scheduling", () => {
  test("saves once the author pauses", async () => {
    const { save, autosave } = setup();
    autosave.schedule();
    expect(autosave.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(99);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(autosave.state).toBe("saved");
    expect(autosave.dirty).toBe(false);
    expect(autosave.savedAt).toBe(Date.now());
  });

  test("continuous typing still saves by the max interval", async () => {
    const { save, autosave } = setup();
    for (let t = 0; t < 1000; t += 50) {
      autosave.schedule();
      await vi.advanceTimersByTimeAsync(50);
    }
    expect(save).toHaveBeenCalledTimes(1);
  });

  test("nothing is written while there is nothing worth writing", async () => {
    const { save, autosave } = setup({ canSave: () => false });
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).not.toHaveBeenCalled();
    expect(autosave.dirty).toBe(true);
  });
});

describe("failures", () => {
  test("a failed save reports, stays dirty, and retries after the retry delay", async () => {
    let fail = true;
    const { save, autosave } = setup({
      save: async () => {
        if (fail) throw new Error("Offline");
      },
    });
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect([autosave.state, autosave.error, autosave.dirty]).toEqual(["error", "Offline", true]);
    fail = false;
    await vi.advanceTimersByTimeAsync(499);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(2);
    expect([autosave.state, autosave.error, autosave.dirty]).toEqual(["saved", null, false]);
  });

  test("a non-Error rejection gets a generic message; a new edit clears the error state", async () => {
    const { autosave } = setup({ save: () => Promise.reject("nope") });
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(autosave.error).toBe("Failed to save.");
    autosave.schedule();
    expect(autosave.state).toBe("idle");
  });
});

describe("concurrency", () => {
  test("an edit during a save is saved afterwards, never concurrently", async () => {
    let release!: () => void;
    let calls = 0;
    const { save, autosave } = setup({
      save: () => {
        calls++;
        return calls === 1 ? new Promise<void>((r) => (release = r)) : Promise.resolve();
      },
    });
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(autosave.state).toBe("saving");
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    // The first save landed but the newer edit is still unsaved.
    expect(autosave.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(2);
    expect(autosave.dirty).toBe(false);
  });

  test("flush waits for an in-flight save and then writes what is pending", async () => {
    let release!: () => void;
    let calls = 0;
    const { save, autosave } = setup({
      save: () => {
        calls++;
        return calls === 1 ? new Promise<void>((r) => (release = r)) : Promise.resolve();
      },
    });
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(100);
    autosave.schedule();
    const flushed = autosave.flush();
    release();
    await flushed;
    expect(save).toHaveBeenCalledTimes(2);
    expect(autosave.dirty).toBe(false);
  });

  test("flush with nothing pending writes nothing", async () => {
    const { save, autosave } = setup();
    await autosave.flush();
    expect(save).not.toHaveBeenCalled();
  });
});

describe("stop and resume", () => {
  test("stop cancels pending timers and ignores later edits", async () => {
    const { save, autosave } = setup();
    autosave.schedule();
    autosave.stop();
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });

  test("a save that lands after stop leaves the state alone", async () => {
    let release!: () => void;
    const { autosave } = setup({ save: () => new Promise<void>((r) => (release = r)) });
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(100);
    autosave.stop();
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(autosave.state).toBe("saving");
  });

  test("resume re-schedules pending changes", async () => {
    const { save, autosave } = setup();
    autosave.schedule();
    autosave.stop();
    autosave.resume();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
  });

  test("resume with nothing pending stays quiet", async () => {
    const { save, autosave } = setup();
    autosave.stop();
    autosave.resume();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });
});
