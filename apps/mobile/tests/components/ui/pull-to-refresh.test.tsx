// @vitest-environment happy-dom
import { act, render } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";

const control = vi.fn<(props: { refreshing: boolean; onRefresh: () => void }) => null>(() => null);
vi.mock("react-native", async (original) => ({
  ...(await original()),
  RefreshControl: (props: never) => control(props),
}));

const lastProps = () => control.mock.calls.at(-1)![0];

describe("PullToRefresh", () => {
  test("spins for a background sync, and stops when it ends", () => {
    const { rerender } = render(<PullToRefresh onRefresh={async () => {}} syncing />);
    expect(lastProps().refreshing).toBe(true);
    rerender(<PullToRefresh onRefresh={async () => {}} syncing={false} />);
    expect(lastProps().refreshing).toBe(false);
  });

  test("a pull spins at least through the spinner's entrance", async () => {
    vi.useFakeTimers();
    render(<PullToRefresh onRefresh={async () => {}} />);
    expect(lastProps().refreshing).toBe(false);
    act(() => lastProps().onRefresh());
    expect(lastProps().refreshing).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(600));
    expect(lastProps().refreshing).toBe(false);
    vi.useRealTimers();
  });
});
