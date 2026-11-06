// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { MathView } from "@/components/reader/math-view";

vi.mock("react-native-svg", () => ({ SvgXml: () => <svg aria-label="typeset" /> }));
vi.mock("@/hooks/use-theme-colors", () => ({ useThemeColor: () => "#000" }));

const idle: (() => void)[] = [];
const runIdle = () =>
  act(() => {
    while (idle.length) idle.shift()!();
  });

// The typeset cache lasts the whole file, so each test uses a formula of its own.
const formula = (id: string) => ({
  type: "math" as const,
  mathml: `<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>${id}</mi></math>`,
  tex: `\\${id}`,
});

beforeEach(() => {
  idle.length = 0;
  vi.stubGlobal("requestIdleCallback", (callback: () => void) => idle.push(callback));
});

describe("MathView", () => {
  test("shows the TeX source at once, then the formula once typeset", () => {
    render(<MathView formula={formula("a")} display={false} />);
    expect(screen.getByText("\\a")).toBeTruthy();
    expect(screen.queryByLabelText("typeset")).toBeNull();

    runIdle();

    expect(screen.getByLabelText("typeset")).toBeTruthy();
    expect(screen.queryByText("\\a")).toBeNull();
  });

  test("a formula typeset before draws straight away, without waiting", () => {
    const { unmount } = render(<MathView formula={formula("b")} display />);
    runIdle();
    unmount();

    render(<MathView formula={formula("b")} display />);
    expect(screen.getByLabelText("typeset")).toBeTruthy();
    expect(idle).toHaveLength(0);
  });

  test("leaving before it's typeset skips the work", () => {
    const { unmount } = render(<MathView formula={formula("c")} display={false} />);
    unmount();
    runIdle();

    render(<MathView formula={formula("c")} display={false} />);
    expect(screen.getByText("\\c")).toBeTruthy();
  });

  test("markup that can't be typeset keeps showing its TeX source", () => {
    render(<MathView formula={{ type: "math", mathml: "<div>not maths</div>", tex: "\\broken" }} display={false} />);
    runIdle();
    expect(screen.getByText("\\broken")).toBeTruthy();
  });
});
