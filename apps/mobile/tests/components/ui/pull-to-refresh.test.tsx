import { act, render } from "@testing-library/react-native";
import type { RefreshControlProps } from "react-native";
import { describe, expect, test, vi } from "vitest";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";

const control = vi.fn<(props: RefreshControlProps) => null>(() => null);
// A Proxy swaps only RefreshControl; spreading the module would read every export and trip RN's deprecation warnings.
vi.mock(import("react-native"), async (importOriginal) => {
  const rn = await importOriginal();
  return new Proxy(rn, { get: (target, key) => (key === "RefreshControl" ? control : Reflect.get(target, key)) });
});

const lastProps = () => control.mock.calls.at(-1)![0];

describe("PullToRefresh", () => {
  test("spins for a background sync, and stops when it ends", async () => {
    const { rerender } = await render(<PullToRefresh onRefresh={async () => {}} syncing />);
    expect(lastProps().refreshing).toBe(true);
    await rerender(<PullToRefresh onRefresh={async () => {}} syncing={false} />);
    expect(lastProps().refreshing).toBe(false);
  });

  test("a pull spins at least through the spinner's entrance", async () => {
    vi.useFakeTimers();
    await render(<PullToRefresh onRefresh={async () => {}} />);
    expect(lastProps().refreshing).toBe(false);
    await act(() => lastProps().onRefresh?.());
    expect(lastProps().refreshing).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(lastProps().refreshing).toBe(false);
    vi.useRealTimers();
  });
});
