import { useEffect, useRef, useState } from "react";
import { PixelRatio } from "react-native";
import { useKeyboardHandler } from "react-native-keyboard-controller";
import { scheduleOnRN } from "react-native-worklets";

type Selectable = { setSelection: (start: number, end: number) => void };

/**
 * Makes Android password managers (1Password, Bitwarden, Google…) offer credentials on credential fields.
 * Flipping the focused field's `importantForAutofill` from auto to yes restarts its input session, which is
 * what prompts them; a flip while the keyboard is still opening is lost, so it waits for the keyboard to settle.
 * Ported from aztu-lms-app's login screen.
 *
 * On a pushed screen that alone isn't enough: the screen is laid out before it's attached, attaching clears
 * Android's "laid out" flag, and Android holds a focused field's autofill request until its next layout, which
 * React Native only runs when a frame changes. So the active field also narrows by one pixel.
 *
 * Android also draws the autofill highlight without subtracting the text's horizontal scroll, so a long filled-in
 * value slides it off the field; an unfocused field's text is scrolled back to its start.
 */
export function useAutofillFields() {
  const [active, setActive] = useState<string | null>(null);
  const focused = useRef<string | null>(null);
  const keyboardOpen = useRef(false);
  const inputs = useRef(new Map<string, Selectable>());
  // A new object each time, so the same field can be scrolled back again.
  const [scrollBack, setScrollBack] = useState<{ field: string } | null>(null);

  // After the commit: the input only accepts a selection made for its latest change event.
  useEffect(() => {
    if (scrollBack) inputs.current.get(scrollBack.field)?.setSelection(0, 0);
  }, [scrollBack]);

  const onKeyboardSettled = (isOpen: boolean) => {
    keyboardOpen.current = isOpen;
    // Closing resets it, so reopening the keyboard on a still-focused field flips it again.
    setActive(isOpen ? focused.current : null);
  };

  useKeyboardHandler(
    {
      onEnd: (event) => {
        "worklet";
        scheduleOnRN(onKeyboardSettled, event.height > 0);
      },
    },
    [],
  );

  /** Spread onto each credential TextInput. */
  return (field: string) => ({
    importantForAutofill: active === field ? ("yes" as const) : ("auto" as const),
    style: { marginRight: active === field ? 1 / PixelRatio.get() : 0 },
    ref: (input: Selectable | null) => {
      if (input) inputs.current.set(field, input);
      else inputs.current.delete(field);
    },
    onChange: () => {
      if (focused.current !== field) setScrollBack({ field });
    },
    onFocus: () => {
      focused.current = field;
      if (keyboardOpen.current) setActive(field);
    },
    onBlur: () => {
      if (focused.current === field) focused.current = null;
      setActive((current) => (current === field ? null : current));
      setScrollBack({ field });
    },
  });
}
