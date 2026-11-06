import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { View, type NativeSyntheticEvent } from "react-native";
import PagerView from "react-native-pager-view";
import { createAnimatedComponent, useEvent, useHandler, type SharedValue } from "react-native-reanimated";
import { pagesToKeep } from "@/lib/swipe-pages";

const AnimatedPagerView = createAnimatedComponent(PagerView);

/** Follows the drag on the UI thread, so whatever reads `progress` moves with the finger rather than after it. */
function usePageScrollHandler(progress: SharedValue<number>) {
  const { doDependenciesDiffer } = useHandler({}, [progress]);
  return useEvent<NativeSyntheticEvent<{ position: number; offset: number }>>(
    (event) => {
      "worklet";
      if (event.eventName.endsWith("onPageScroll")) progress.set(event.position + event.offset);
    },
    ["onPageScroll"],
    doDependenciesDiffer,
  );
}

/**
 * Pages side by side in the platform's native pager, for the content under `UnderlineTabs`. `progress` is the position
 * in pages (1.4 is 40% of the way from the second to the third). A page mounts when it's next to the current one, so a
 * swipe never lands on a blank screen, and stays mounted to keep its scroll position.
 */
export function SwipePages<T extends string>({
  pages,
  value,
  onChange,
  renderPage,
  progress,
}: {
  pages: readonly T[];
  value: T;
  onChange: (value: T) => void;
  renderPage: (page: T) => ReactNode;
  progress: SharedValue<number>;
}) {
  const pager = useRef<PagerView>(null);
  const index = Math.max(pages.indexOf(value), 0);
  const [initialIndex] = useState(index);
  const shownPage = useRef(index);
  const [mounted, setMounted] = useState<ReadonlySet<T>>(() => new Set());
  const onPageScroll = usePageScrollHandler(progress);

  useEffect(() => {
    progress.set(initialIndex);
  }, [progress, initialIndex]);

  // Tapping a tab, or the default feed changing. After a swipe the pager is already there, and moving it again would
  // interrupt its settling.
  useEffect(() => {
    if (shownPage.current === index) return;
    shownPage.current = index;
    pager.current?.setPage(index);
  }, [index]);

  // In idle time: opening Home shouldn't wait for feeds nobody has looked at yet.
  useEffect(() => {
    const idle = requestIdleCallback(() => setMounted((current) => pagesToKeep(pages, index, current)));
    return () => cancelIdleCallback(idle);
  }, [index, pages]);

  return (
    <AnimatedPagerView
      ref={pager}
      // Not `className`: Uniwind only reaches React Native's own components.
      style={{ flex: 1 }}
      initialPage={initialIndex}
      // Every page stays alive: dropping one would lose its scroll position.
      offscreenPageLimit={pages.length}
      overScrollMode="never"
      onPageScroll={onPageScroll}
      onPageSelected={(event) => {
        const { position } = event.nativeEvent;
        shownPage.current = position;
        const next = pages[position];
        if (next === undefined || next === value) return;
        void Haptics.selectionAsync();
        onChange(next);
      }}
    >
      {pages.map((page) => (
        <View key={page} collapsable={false}>
          {page === value || mounted.has(page) ? renderPage(page) : null}
        </View>
      ))}
    </AnimatedPagerView>
  );
}
