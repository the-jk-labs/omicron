// @vitest-environment happy-dom
import { waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { emptyPhase } from "@/lib/query/list-state";
import { usePagedQuery } from "@/lib/query/paged";
import { renderQueryHook } from "../../support/query";

const page = { items: [], nextCursor: null };

describe("emptyPhase", () => {
  // A private account's posts query is disabled; it never fetches, so it must not spin forever.
  test("a disabled query is empty, not loading", () => {
    const { result } = renderQueryHook(() => usePagedQuery(["posts", "locked"], async () => page, { enabled: false }));
    expect(result.current.isPending).toBe(true);
    expect(emptyPhase(result.current, false)).toBe("empty");
  });

  test("loading while the first page is in flight, empty once it arrives", async () => {
    const { result } = renderQueryHook(() => usePagedQuery(["posts", "open"], async () => page));
    expect(emptyPhase(result.current, false)).toBe("loading");
    await waitFor(() => expect(emptyPhase(result.current, false)).toBe("empty"));
  });

  test("offline while a first load is waiting for the network", () => {
    expect(emptyPhase({ isPending: true, fetchStatus: "paused", error: null }, true)).toBe("offline");
  });

  test("an error with nothing cached", async () => {
    const { result } = renderQueryHook(() =>
      usePagedQuery(["posts", "broken"], async () => {
        throw new Error("down");
      }),
    );
    await waitFor(() => expect(emptyPhase(result.current, false)).toBe("error"));
  });
});
