// Minimal react-native stand-in (aliased in vitest.config.ts). Host components render plain DOM nodes.
import { createElement, type ReactNode } from "react";
import { vi } from "vitest";

type HostProps = { children?: ReactNode; testID?: string; className?: string };

const host =
  (tag: string) =>
  ({ children, testID, className }: HostProps) =>
    createElement(tag, { "data-testid": testID, className }, children);

export const View = host("div");
export const Text = host("span");
export const Modal = ({ visible, children }: HostProps & { visible?: boolean }) =>
  visible ? createElement("div", { role: "dialog" }, children) : null;

export const Pressable = ({
  onPress,
  children,
  testID,
  disabled,
}: HostProps & { onPress?: (e: unknown) => void; style?: unknown; disabled?: boolean | null }) =>
  createElement(
    "button",
    { type: "button", "data-testid": testID, disabled: !!disabled, onClick: (e: unknown) => onPress?.(e) },
    children,
  );

export const ActivityIndicator = () => createElement("progress");

export const ScrollView = host("div");
export const RefreshControl = () => null;

type FlatListProps<T> = {
  data?: readonly T[] | null;
  renderItem: (info: { item: T; index: number }) => ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  ListHeaderComponent?: ReactNode;
  ListEmptyComponent?: ReactNode;
};

export function FlatList<T>({
  data,
  renderItem,
  keyExtractor,
  ListHeaderComponent,
  ListEmptyComponent,
}: FlatListProps<T>) {
  const items = data ?? [];
  return createElement(
    "div",
    null,
    ListHeaderComponent,
    items.length === 0
      ? ListEmptyComponent
      : items.map((item, index) =>
          createElement("div", { key: keyExtractor?.(item, index) ?? index }, renderItem({ item, index })),
        ),
  );
}

export const StyleSheet = { create: <T,>(styles: T) => styles };

export const PixelRatio = { get: () => 3 };

export const Platform = {
  get OS(): "android" | "ios" | "web" {
    return "android";
  },
  Version: 34,
  constants: { Release: "14", Model: "Pixel 8" },
  select: <T,>(spec: { android?: T; ios?: T; default?: T }) => spec.android ?? spec.default,
};

export const AppState = {
  currentState: "active",
  addEventListener: vi.fn<(type: string, listener: (state: string) => void) => { remove: () => void }>(
    (_type, _listener) => ({ remove: vi.fn<() => void>() }),
  ),
};

export const Linking = {
  openURL: vi.fn<(url: string) => Promise<boolean>>((_url) => Promise.resolve(true)),
};

// Last added runs first, and one returning true stops the rest, as on Android.
const backListeners: (() => boolean)[] = [];
export const BackHandler = {
  addEventListener: (_type: "hardwareBackPress", listener: () => boolean) => {
    backListeners.unshift(listener);
    return { remove: () => void backListeners.splice(backListeners.indexOf(listener), 1) };
  },
  /** Test helper: what pressing Back does; false means the system handles it (closes the screen or app). */
  press: () => backListeners.some((listener) => listener()),
};
