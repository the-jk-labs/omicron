// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { InstanceLogo } from "@/components/layout/instance-logo";

let logoUrl: string | null | undefined;
let theme = "dark";
let fail = () => {};

vi.mock("expo-image", () => ({
  Image: ({ source, onError }: { source: unknown; onError: () => void }) => {
    fail = onError;
    return <output>{String(source)}</output>;
  },
}));
vi.mock("uniwind", () => ({ useUniwind: () => ({ theme }) }));
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ media: (url: string | null | undefined) => (url ? `https://blog.test${url}` : undefined) }),
}));
vi.mock("@/lib/query/instance", () => ({
  useInstanceInfo: () => ({ data: logoUrl === undefined ? undefined : { logoUrl } }),
}));
vi.mock("../../../assets/images/splash-dark.png", () => ({ default: "built-in-dark" }));
vi.mock("../../../assets/images/splash-light.png", () => ({ default: "built-in-light" }));

const shown = () => screen.getByRole("status").textContent;

beforeEach(() => {
  logoUrl = null;
  theme = "dark";
});

describe("InstanceLogo", () => {
  test.each([
    ["dark", "built-in-dark"],
    ["light", "built-in-light"],
  ])("with no custom logo it uses the built-in one for the %s theme", (name, expected) => {
    theme = name;
    render(<InstanceLogo size={32} />);
    expect(shown()).toBe(expected);
  });

  test("shows the built-in one while the instance is still loading", () => {
    logoUrl = undefined;
    render(<InstanceLogo size={32} />);
    expect(shown()).toBe("built-in-dark");
  });

  test("uses the admin's logo from the instance's origin", () => {
    logoUrl = "/api/uploads/mine.webp";
    render(<InstanceLogo size={32} />);
    expect(shown()).toBe("https://blog.test/api/uploads/mine.webp");
  });

  test("falls back to the built-in one when the admin's can't load", () => {
    logoUrl = "/api/uploads/mine.webp";
    render(<InstanceLogo size={32} />);
    act(() => fail());
    expect(shown()).toBe("built-in-dark");
  });
});
