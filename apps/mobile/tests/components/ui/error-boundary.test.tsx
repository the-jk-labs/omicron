import { act, render, screen } from "@testing-library/react-native";
import { Text, View } from "react-native";
import { describe, expect, test, vi } from "vitest";
import { ErrorBoundary } from "@/components/ui/error-boundary";

let shouldThrow = true;
function ThrowsString(): never {
  // oxlint-disable-next-line no-throw-literal
  throw "plain string";
}
function Flaky() {
  if (shouldThrow) throw new Error("boom");
  return <Text>content</Text>;
}

describe("ErrorBoundary", () => {
  test("renders its children when nothing throws", async () => {
    shouldThrow = false;
    await render(<ErrorBoundary fallback={() => <Text>fallback</Text>}>{<Flaky />}</ErrorBoundary>);
    expect(screen.getByText("content")).toBeTruthy();
  });

  test("shows the fallback with the error, and reset renders the children again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    shouldThrow = true;
    let reset: () => void = vi.fn<() => void>();
    await render(
      <ErrorBoundary
        fallback={(error, retry) => {
          reset = retry;
          return <Text>failed: {error.message}</Text>;
        }}
      >
        <Flaky />
      </ErrorBoundary>,
    );
    expect(screen.getByText("failed: boom")).toBeTruthy();

    shouldThrow = false;
    await act(() => reset());
    expect(screen.getByText("content")).toBeTruthy();
  });

  test("a thrown non-Error still reaches the fallback as an Error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await render(
      <ErrorBoundary fallback={(error) => <Text>{error instanceof Error ? error.message : "not an Error"}</Text>}>
        <ThrowsString />
      </ErrorBoundary>,
    );
    expect(screen.getByText("plain string")).toBeTruthy();
  });

  test("a sibling outside the boundary keeps rendering", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    shouldThrow = true;
    await render(
      <View>
        <Text>sibling</Text>
        <ErrorBoundary fallback={() => <Text>fallback</Text>}>
          <Flaky />
        </ErrorBoundary>
      </View>,
    );
    expect(screen.getByText("sibling")).toBeTruthy();
    expect(screen.getByText("fallback")).toBeTruthy();
  });
});
