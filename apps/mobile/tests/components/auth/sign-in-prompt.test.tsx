// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SignInPrompt } from "@/components/auth/sign-in-prompt";
import { chooseInstance, readInstance, signInPrompt } from "@/lib/instance/store";

const push = vi.fn<(href: unknown) => void>();
let viewer = { signedIn: false, isPending: false };

vi.mock("expo-router", () => ({ router: { push: (href: unknown) => push(href) } }));
vi.mock("@/lib/auth/session", () => ({ useViewer: () => viewer }));

beforeEach(() => {
  push.mockClear();
  signInPrompt.set(false);
  viewer = { signedIn: false, isPending: false };
});

describe("SignInPrompt", () => {
  test("choosing an instance saves it and opens its sign-in once, with the option to put it off", () => {
    chooseInstance({ origin: "https://omicron.test", name: "Omicron" });
    expect(readInstance()).toEqual({ origin: "https://omicron.test", name: "Omicron" });

    const { rerender } = render(<SignInPrompt />);
    expect(push).toHaveBeenCalledExactlyOnceWith({ pathname: "/sign-in", params: { welcome: "1" } });
    expect(signInPrompt.get()).toBe(false);

    rerender(<SignInPrompt />);
    expect(push).toHaveBeenCalledOnce();
  });

  test("waits for the session, and stays quiet when the instance already knows this device", () => {
    viewer = { signedIn: false, isPending: true };
    signInPrompt.set(true);
    const { rerender } = render(<SignInPrompt />);
    expect(push).not.toHaveBeenCalled();
    expect(signInPrompt.get()).toBe(true);

    viewer = { signedIn: true, isPending: false };
    rerender(<SignInPrompt />);
    expect(push).not.toHaveBeenCalled();
    expect(signInPrompt.get()).toBe(false);
  });

  test("an app opened on a saved instance never prompts", () => {
    render(<SignInPrompt />);
    expect(push).not.toHaveBeenCalled();
  });
});
