import { act, render, screen } from "@testing-library/react-native";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { InstanceLogo } from "@/components/layout/instance-logo";

let logoUrl: string | null | undefined;
let theme = "dark";
let fail = () => {};

vi.mock("expo-image", async () => {
  const { Text } = await import("react-native");
  return {
    Image: ({ source, onError }: { source: unknown; onError: () => void }) => {
      fail = onError;
      return <Text testID="logo">{String(source)}</Text>;
    },
  };
});
vi.mock("uniwind", () => ({ useUniwind: () => ({ theme }) }));
vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ media: (url: string | null | undefined) => (url ? `https://blog.test${url}` : undefined) }),
}));
vi.mock("@/lib/query/instance", () => ({
  useInstanceInfo: () => ({ data: logoUrl === undefined ? undefined : { logoUrl } }),
}));
vi.mock("../../../assets/images/splash-dark.png", () => ({ default: "built-in-dark" }));
vi.mock("../../../assets/images/splash-light.png", () => ({ default: "built-in-light" }));

const shown = () => screen.getByTestId("logo");

beforeEach(() => {
  logoUrl = null;
  theme = "dark";
});

describe("InstanceLogo", () => {
  test.each([
    ["dark", "built-in-dark"],
    ["light", "built-in-light"],
  ])("with no custom logo it uses the built-in one for the %s theme", async (name, expected) => {
    theme = name;
    await render(<InstanceLogo size={32} />);
    expect(shown()).toHaveTextContent(expected);
  });

  test("shows the built-in one while the instance is still loading", async () => {
    logoUrl = undefined;
    await render(<InstanceLogo size={32} />);
    expect(shown()).toHaveTextContent("built-in-dark");
  });

  test("uses the admin's logo from the instance's origin", async () => {
    logoUrl = "/api/uploads/mine.webp";
    await render(<InstanceLogo size={32} />);
    expect(shown()).toHaveTextContent("https://blog.test/api/uploads/mine.webp");
  });

  test("falls back to the built-in one when the admin's can't load", async () => {
    logoUrl = "/api/uploads/mine.webp";
    await render(<InstanceLogo size={32} />);
    await act(() => fail());
    expect(shown()).toHaveTextContent("built-in-dark");
  });
});
