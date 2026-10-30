import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import { useRef, useState, type ReactNode, type RefObject } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "tailwind-variants";
import { useBackDismiss } from "@/hooks/use-back-dismiss";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { Icon, type IconName } from "./icon";
import { PressableScale } from "./pressable";
import { Text } from "./text";

export function useSheet() {
  const ref = useRef<BottomSheetModal>(null);
  return { ref, present: () => ref.current?.present(), dismiss: () => ref.current?.dismiss() };
}

const renderBackdrop = (props: BottomSheetBackdropProps) => (
  <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />
);

/** Bottom sheet sized to its content. Stands in for the web's popovers, dropdown menus and selects. */
export function Sheet({
  sheetRef,
  title,
  children,
  onDismiss,
  scrollable = false,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
  /** For long content: a tall sheet that scrolls, instead of one sized to fit. */
  scrollable?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [background, handle] = useThemeColors(["--color-background", "--color-dark-40"]);
  const [open, setOpen] = useState(false);
  useBackDismiss(open, () => sheetRef.current?.dismiss());
  return (
    <BottomSheetModal
      ref={sheetRef}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: background, borderRadius: 20 }}
      handleIndicatorStyle={{ backgroundColor: handle }}
      onChange={(index) => setOpen(index >= 0)}
      onDismiss={() => {
        setOpen(false);
        onDismiss?.();
      }}
      enableDynamicSizing={!scrollable}
      snapPoints={scrollable ? ["90%"] : undefined}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      {scrollable ? (
        <BottomSheetScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {title && (
            <Text weight="semibold" className="px-5 pt-1 pb-3">
              {title}
            </Text>
          )}
          {children}
        </BottomSheetScrollView>
      ) : (
        <BottomSheetView style={{ paddingBottom: insets.bottom + 12 }}>
          {title && (
            <Text weight="semibold" className="px-5 pt-1 pb-3">
              {title}
            </Text>
          )}
          {children}
        </BottomSheetView>
      )}
    </BottomSheetModal>
  );
}

export type MenuItem = {
  label: string;
  icon: IconName;
  onPress: () => void;
  /** A second line under the label. */
  detail?: string;
  /** Opens another screen, so it ends in a chevron as in Settings. */
  opens?: boolean;
  destructive?: boolean;
  hidden?: boolean;
  /** Runs once the sheet has finished closing: a system overlay (the share chooser) opened sooner freezes the
   * sheet mid-slide behind it. */
  afterClose?: boolean;
};

function MenuRow({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="menuitem"
      pressedScale={0.99}
      onPress={onPress}
      className="min-h-14 flex-row items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0 active:bg-muted"
    >
      <View
        className={cn(
          "size-9 items-center justify-center rounded-10px",
          item.destructive ? "bg-destructive/10" : "bg-muted",
        )}
      >
        <Icon name={item.icon} size={18} className={item.destructive ? "text-destructive" : "text-foreground"} />
      </View>
      <View className="flex-1 gap-0.5">
        <Text weight="medium" tone={item.destructive ? "destructive" : "default"}>
          {item.label}
        </Text>
        {item.detail ? (
          <Text size="xs" tone="muted" numberOfLines={2}>
            {item.detail}
          </Text>
        ) : null}
      </View>
      {item.opens && <Icon name="chevron-right" size={16} className="text-muted-foreground" />}
    </PressableScale>
  );
}

/**
 * A dropdown menu as a sheet, laid out like Settings: rows grouped on a card, destructive actions in a group of
 * their own at the end. `header` sits above them (the account menu's avatar and name).
 */
export function MenuSheet({
  sheetRef,
  title,
  header,
  items,
  onDismiss,
}: {
  sheetRef: RefObject<BottomSheetModal | null>;
  title?: string;
  header?: ReactNode;
  items: MenuItem[];
  onDismiss?: () => void;
}) {
  const pending = useRef<(() => void) | null>(null);
  const shown = items.filter((item) => !item.hidden);
  const groups = [shown.filter((item) => !item.destructive), shown.filter((item) => item.destructive)].filter(
    (group) => group.length > 0,
  );
  return (
    <Sheet
      sheetRef={sheetRef}
      title={title}
      onDismiss={() => {
        pending.current?.();
        pending.current = null;
        onDismiss?.();
      }}
    >
      {header}
      <View className="gap-3 px-4 pt-1">
        {groups.map((group) => (
          <View
            key={group[0].label}
            className="overflow-hidden rounded-card border border-border-card bg-background-alt"
          >
            {group.map((item) => (
              <MenuRow
                key={item.label}
                item={item}
                onPress={() => {
                  if (item.afterClose) pending.current = item.onPress;
                  sheetRef.current?.dismiss();
                  if (!item.afterClose) item.onPress();
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </Sheet>
  );
}
