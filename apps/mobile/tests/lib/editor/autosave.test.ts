import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Autosave, type AutosaveSnapshot } from "@/lib/editor/autosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup(options: { canSave?: () => boolean; save?: () => Promise<void> } = {}) {
  const save = vi.fn<() => Promise<void>>(options.save ?? (async () => undefined));
  const changes: AutosaveSnapshot[] = [];
  const autosave = new Autosave({
    save,
    canSave: options.canSave ?? (() => true),
    onChange: (snapshot) => changes.push(snapshot),
    idleMs: 2000,
    maxMs: 10_000,
    retryMs: 5000,
  });
  return { autosave, save, changes };
}

describe("Autosave", () => {
  test("saves once the author pauses", async () => {
    const { autosave, save } = setup();
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(1999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledOnce();
    expect(autosave.state).toBe("saved");
    expect(autosave.dirty).toBe(false);
  });

  test("saves anyway when typing never pauses", async () => {
    const { autosave, save } = setup();
    for (let i = 0; i < 12; i++) {
      autosave.schedule();
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(save).toHaveBeenCalledOnce();
  });

  test("never runs two saves at once, and saves edits made during one afterwards", async () => {
    const gate = Promise.withResolvers<void>();
    const { autosave, save } = setup({ save: () => gate.promise });
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(2000);
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledOnce();

    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(autosave.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  test("a failure is reported and retried later", async () => {
    let fail = true;
    const { autosave, save } = setup({
      save: async () => {
        if (fail) throw new Error("offline");
      },
    });
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(2000);
    expect(autosave.state).toBe("error");
    expect(autosave.error).toBe("offline");

    fail = false;
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(autosave.state).toBe("saved");
  });

  test("nothing is saved while there is nothing worth saving", async () => {
    const { autosave, save } = setup({ canSave: () => false });
    autosave.schedule();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(save).not.toHaveBeenCalled();
  });

  test("stop() cancels pending saves; flush() saves now", async () => {
    const { autosave, save } = setup();
    autosave.schedule();
    await autosave.flush();
    expect(save).toHaveBeenCalledOnce();

    autosave.schedule();
    autosave.stop();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(save).toHaveBeenCalledOnce();
  });
});
