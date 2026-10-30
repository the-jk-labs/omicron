// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { ErrorBoundary } from "@/components/ui/error-boundary";

let shouldThrow = true;
function ThrowsString(): never {
  // oxlint-disable-next-line no-throw-literal
  throw "plain string";
}
function Flaky() {
  if (shouldThrow) throw new Error("boom");
  return <span>content</span>;
}

describe("ErrorBoundary", () => {
  test("renders its children when nothing throws", () => {
    shouldThrow = false;
    render(<ErrorBoundary fallback={() => <span>fallback</span>}>{<Flaky />}</ErrorBoundary>);
    expect(screen.getByText("content")).toBeTruthy();
  });

  test("shows the fallback with the error, and reset renders the children again", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    shouldThrow = true;
    let reset: () => void = vi.fn<() => void>();
    render(
      <ErrorBoundary
        fallback={(error, retry) => {
          reset = retry;
          return <span>failed: {error.message}</span>;
        }}
      >
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText("failed: boom")).toBeTruthy();

    shouldThrow = false;
    act(() => reset());
    expect(screen.getByText("content")).toBeTruthy();
  });

  test("a thrown non-Error still reaches the fallback as an Error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={(error) => <span>{error instanceof Error ? error.message : "not an Error"}</span>}>
        <ThrowsString />
      </ErrorBoundary>,
    );
    expect(screen.getByText("plain string")).toBeTruthy();
  });

  test("a sibling outside the boundary keeps rendering", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    shouldThrow = true;
    render(
      <div>
        <span>sibling</span>
        <ErrorBoundary fallback={() => <span>fallback</span>}>
          <Flaky />
        </ErrorBoundary>
      </div>,
    );
    expect(screen.getByText("sibling")).toBeTruthy();
    expect(screen.getByText("fallback")).toBeTruthy();
  });
});
