import { fireEvent, render, screen } from "@testing-library/react-native";
import { useImperativeHandle, type ReactNode, type Ref } from "react";
import { describe, expect, test, vi } from "vitest";
import { MenuSheet, useSheet } from "@/components/ui/sheet";

// The modal stands in as its children, and its dismiss() is held until the test finishes the close.
let finishClose: (() => void) | null = null;
vi.mock("@gorhom/bottom-sheet", async () => {
  const { View } = await import("react-native");
  return {
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: View,
    BottomSheetView: View,
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
      return <View>{children}</View>;
    },
  };
});
vi.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock("@/hooks/use-theme-colors", () => ({ useThemeColors: (names: string[]) => names }));
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));
vi.mock("@/components/ui/pressable", async () => {
  const { Pressable } = await import("react-native");
  return {
    PressableScale: ({ onPress, children }: { onPress: () => void; children?: ReactNode }) => (
      <Pressable onPress={onPress}>{children}</Pressable>
    ),
  };
});

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
  test("an afterClose item waits for the sheet to finish closing", async () => {
    const [share, edit, onDismiss] = [vi.fn<() => void>(), vi.fn<() => void>(), vi.fn<() => void>()];
    await render(<Menu share={share} edit={edit} onDismiss={onDismiss} />);
    await fireEvent.press(screen.getByText("Share"));
    expect(share).not.toHaveBeenCalled();
    finishClose!();
    expect(share).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  test("other items run at once, and a later plain close runs nothing left over", async () => {
    const [share, edit, onDismiss] = [vi.fn<() => void>(), vi.fn<() => void>(), vi.fn<() => void>()];
    await render(<Menu share={share} edit={edit} onDismiss={onDismiss} />);
    await fireEvent.press(screen.getByText("Edit"));
    expect(edit).toHaveBeenCalledOnce();
    finishClose!();
    expect(share).not.toHaveBeenCalled();
  });
});
