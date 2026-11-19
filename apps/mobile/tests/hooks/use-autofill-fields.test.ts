import { act, renderHook } from "@testing-library/react-native";
import { PixelRatio } from "react-native";
import { describe, expect, test, vi } from "vitest";
import { useAutofillFields } from "@/hooks/use-autofill-fields";

type KeyboardEnd = (event: { height: number }) => void;
const keyboard = vi.hoisted(() => ({ onEnd: null as KeyboardEnd | null }));

vi.mock("react-native-keyboard-controller", () => ({
  useKeyboardHandler: (handlers: { onEnd: KeyboardEnd }) => {
    keyboard.onEnd = handlers.onEnd;
  },
}));
vi.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));

const keyboardSettled = (open: boolean) => act(() => keyboard.onEnd?.({ height: open ? 300 : 0 }));
// One physical pixel.
const NUDGE = 1 / PixelRatio.get();

describe("useAutofillFields", () => {
  // Bug: a pushed screen is laid out before it is attached, attaching clears Android's "laid out" flag, and
  // React Native never lays an unchanged frame out again, so Android held the autofill request back forever.
  test("the focused field's frame changes once the keyboard settles, so Android lays it out again", async () => {
    const { result } = await renderHook(() => useAutofillFields());
    await act(() => result.current("password").onFocus());
    expect(result.current("password").style.marginRight).toBe(0);

    await keyboardSettled(true);

    expect(result.current("password").style.marginRight).toBe(NUDGE);
    expect(result.current("password").importantForAutofill).toBe("yes");
    expect(result.current("identifier").style.marginRight).toBe(0);
  });

  test("moving to another field with the keyboard open nudges that field instead", async () => {
    const { result } = await renderHook(() => useAutofillFields());
    await act(() => result.current("identifier").onFocus());
    await keyboardSettled(true);

    await act(() => {
      result.current("identifier").onBlur();
      result.current("password").onFocus();
    });

    expect(result.current("password").style.marginRight).toBe(NUDGE);
    expect(result.current("identifier").style.marginRight).toBe(0);
  });

  test("closing the keyboard puts the field back, and reopening it nudges again", async () => {
    const { result } = await renderHook(() => useAutofillFields());
    await act(() => result.current("password").onFocus());
    await keyboardSettled(true);

    await keyboardSettled(false);
    expect(result.current("password").style.marginRight).toBe(0);
    expect(result.current("password").importantForAutofill).toBe("auto");

    await keyboardSettled(true);
    expect(result.current("password").style.marginRight).toBe(NUDGE);
  });

  // Bug: Android draws the autofill highlight without subtracting the text's horizontal scroll, so a long
  // filled-in password slid its yellow box left, off the field.
  test("a value filled in from outside scrolls back to its start, keeping the highlight on the field", async () => {
    const { result } = await renderHook(() => useAutofillFields());
    const input = { setSelection: vi.fn<(start: number, end: number) => void>() };
    await act(() => result.current("password").ref(input));
    await act(() => result.current("identifier").onFocus());

    await act(() => result.current("password").onChange());

    expect(input.setSelection).toHaveBeenCalledWith(0, 0);
  });

  test("typing in the focused field leaves the cursor alone until it loses focus", async () => {
    const { result } = await renderHook(() => useAutofillFields());
    const input = { setSelection: vi.fn<(start: number, end: number) => void>() };
    await act(() => result.current("password").ref(input));
    await act(() => result.current("password").onFocus());

    await act(() => result.current("password").onChange());
    expect(input.setSelection).not.toHaveBeenCalled();

    await act(() => result.current("password").onBlur());
    expect(input.setSelection).toHaveBeenCalledWith(0, 0);
  });
});
