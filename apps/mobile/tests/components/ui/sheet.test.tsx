// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { createElement, useImperativeHandle, type ReactNode, type Ref } from "react";
import { describe, expect, test, vi } from "vitest";
import { MenuSheet, useSheet } from "@/components/ui/sheet";

// The modal stands in as its children, and its dismiss() is held until the test finishes the close.
let finishClose: (() => void) | null = null;
const { Pass } = vi.hoisted(() => ({
  Pass: ({ children }: { children?: ReactNode }) => createElement("div", null, children),
}));
vi.mock("@gorhom/bottom-sheet", () => {
  return {
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: Pass,
    BottomSheetView: Pass,
    BottomSheetModal: ({
      ref,
      onDismiss,
      children,
    }: {
      ref: Ref<{ dismiss: () => void }>;
      onDismiss: () => void;
      children?: ReactNode;
    }) => {
      useImperativeHandle(ref, () => ({ dismiss: () => (finishClose = onDismiss) }));
      return createElement("div", null, children);
    },
  };
});
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@/hooks/use-theme-colors", () => ({ useThemeColors: (names: string[]) => names }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/pressable", () => ({
  PressableScale: ({ onPress, children }: { onPress: () => void; children?: ReactNode }) =>
    createElement("button", { onClick: onPress }, children),
}));

function Menu({ share, edit, onDismiss }: { share: () => void; edit: () => void; onDismiss: () => void }) {
  const sheet = useSheet();
  return (
    <MenuSheet
      sheetRef={sheet.ref}
      onDismiss={onDismiss}
      items={[
        { label: "Share", icon: "share-2", afterClose: true, onPress: share },
        { label: "Edit", icon: "pencil", onPress: edit },
      ]}
    />
  );
}

describe("MenuSheet", () => {
  test("an afterClose item waits for the sheet to finish closing", () => {
    const [share, edit, onDismiss] = [vi.fn<() => void>(), vi.fn<() => void>(), vi.fn<() => void>()];
    render(<Menu share={share} edit={edit} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Share"));
    expect(share).not.toHaveBeenCalled();
    finishClose!();
    expect(share).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  test("other items run at once, and a later plain close runs nothing left over", () => {
    const [share, edit, onDismiss] = [vi.fn<() => void>(), vi.fn<() => void>(), vi.fn<() => void>()];
    render(<Menu share={share} edit={edit} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Edit"));
    expect(edit).toHaveBeenCalledOnce();
    finishClose!();
    expect(share).not.toHaveBeenCalled();
  });
});
