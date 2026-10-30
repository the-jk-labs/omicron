# STYLE.md — how the app looks and moves

The app shares the web's design (the bits-ui docs theme) but is a native app, not the mobile website: layouts,
navigation and controls follow platform conventions where those serve people better.

## Tokens

- Colours, radii, shadows and fonts are in `src/global.css`, ported from `apps/frontend/src/app.css`. Keep the two
  in step and never invent new tokens. The one exception is the app-only reaction colours (`repost`, `saved`).
- Use token classes only: `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`,
  `bg-muted`, `text-destructive`, `rounded-input`, `rounded-card`, `shadow-mini`… No Tailwind palette colours
  (`bg-gray-*`), no hex values in components.
- A prop that needs a colour value (SVG fill, sheet background, Reanimated interpolation, WebView CSS) reads it
  with `useThemeColor`/`useThemeColors` (`src/hooks/use-theme-colors.ts`).
- Fonts: Inter for the interface (`font-sans`, `-medium`, `-semibold`, `-bold`), Source Sans 3 for article text
  (`font-content*`). React Native can't synthesize weights: pick the family, not `font-bold`. Use `Text`'s
  `weight` prop.

## Component kit (`src/components/ui`)

Use the kit before writing new UI: `Text`, `Button`, `IconButton`, `Icon` (Lucide), `Avatar`, `Card`,
`Separator`, `Badge`, `Input`/`Field`, `Switch`, `Checkbox`, `UnderlineTabs`, `PillTabs`, `Skeleton`, `Sheet`,
`MenuSheet`, `confirm()`, `toast()`, and the states (`EmptyState`, `ErrorState`, `LoadingState`, `OfflineState`,
`ListFooter`). Variants are `tailwind-variants`; callers extend with `className`, merged by `cn`.

- **Tabs:** `UnderlineTabs` (full width) splits a screen's content: feeds, profile sections, search scopes.
  `PillTabs` is for choosing a setting (theme, date range).
- **Menus and popovers** are bottom sheets (`MenuSheet`, `Sheet`). One shared sheet per app-wide action (see
  `SaveToListHost`), never a sheet per list row.
- **Confirmation** uses `confirm()` / `confirmDialog()` (promise API, like the web's).
- **Pull to refresh** is `<PullToRefresh onRefresh={query.refetch} />`, never a bare `RefreshControl`: it spins
  only for the person's pull and is themed for both modes.
- Every screen handles loading, empty, error and offline states.

## Navigation and motion

- Going deeper pushes from the side (`ios_from_right`); tasks laid over the app (compose, sign-in) rise from the
  bottom; search fades in place; redirects don't animate. Base options are in
  `src/components/layout/stack-options.ts`, and every stack uses them so screens are never transparent (a
  transparent screen flashes the white window behind it on Android).
- The tab bar retracts on scroll-down and returns on scroll-up (`useTabBarScrollOffset`).
- All animation runs on the UI thread with Reanimated: press feedback (`PressableScale`), tab markers, toggles,
  sheets, list items. No `Animated` from react-native, no JS-driven timers for motion.
- Light haptics (`expo-haptics` `selectionAsync`) on tab changes and toggles; never on plain navigation.

## Lists and performance

- Long or growing lists use LegendList (`@legendapp/list`, `recycleItems`); `PostList` covers every timeline.
- Images use `expo-image` with a `recyclingKey` in recycled rows.
- Memoize row components (`memo`) and keep `renderItem`/`keyExtractor` outside render.
- Article bodies are parsed once (`parseHtml`) and rendered natively; formulas render as MathML in a sized WebView.

## Accessibility

- Every pressable has a role and, when it has no visible text, an `accessibilityLabel`.
- Avatars are decorative; name the person in adjacent text.
- Touch targets are at least 40×40 (use `hitSlop` for small icons).
- Respect the system font scale; don't fix heights on text containers.
