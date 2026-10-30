import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { cn } from "tailwind-variants";
import { useUniwind } from "uniwind";
import { useApi } from "@/components/instance-provider";
import { FormScreen } from "@/components/settings/form-screen";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-row";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { inputClass, SheetInput } from "@/components/ui/input";
import { Sheet, useSheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { PillTabs } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { useRefreshOnFocus } from "@/hooks/use-refresh-on-focus";
import type { FeedTab } from "@/lib/api/endpoints";
import { useViewer } from "@/lib/auth/session";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { LANGUAGES } from "@/lib/languages";
import { homeFeed, useDefaultFeed, useFeedLangFilter } from "@/lib/prefs";
import { queryKeys } from "@/lib/query/keys";
import { setThemePreference, type ThemePreference } from "@/lib/theme/theme";

/** Every language in one sheet, filtered as you type; the chosen ones stay ticked at the top. */
function LanguagePicker({
  sheetRef,
  chosen,
  onToggle,
  onClear,
}: {
  sheetRef: ReturnType<typeof useSheet>["ref"];
  chosen: Set<string>;
  onToggle: (code: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = LANGUAGES.filter(
    (l) => !q || l.name.toLowerCase().includes(q) || l.native.toLowerCase().includes(q) || l.code === q,
  );
  const ordered = [...matches.filter((l) => chosen.has(l.code)), ...matches.filter((l) => !chosen.has(l.code))];

  return (
    <Sheet sheetRef={sheetRef} scrollable onDismiss={() => setQuery("")}>
      <View className="flex-row items-center justify-between px-5 pt-1 pb-3">
        <Text weight="semibold">Feed languages</Text>
        {chosen.size > 0 && (
          <Button size="xs" variant="ghost" onPress={onClear}>
            Clear
          </Button>
        )}
      </View>
      <View className="justify-center px-4 pb-2">
        <SheetInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search languages"
          autoCapitalize="none"
          placeholderTextColorClassName="accent-muted-foreground"
          className={`h-10 pl-9 ${inputClass}`}
        />
        <View className="absolute left-7" pointerEvents="none">
          <Icon name="search" size={16} className="text-muted-foreground" />
        </View>
      </View>
      <View className="px-2">
        {ordered.map((language) => {
          const on = chosen.has(language.code);
          return (
            <Pressable
              key={language.code}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => onToggle(language.code)}
              className="h-12 flex-row items-center gap-3 rounded-9px px-3 active:bg-muted"
            >
              <View className="flex-1">
                <Text weight="medium" numberOfLines={1}>
                  {language.name}
                </Text>
              </View>
              <Text size="sm" tone="muted" numberOfLines={1}>
                {language.native}
              </Text>
              <View
                className={cn(
                  "size-5 items-center justify-center rounded-full border",
                  on ? "border-foreground bg-foreground" : "border-border-input",
                )}
              >
                {on && <Icon name="check" size={12} className="text-background" />}
              </View>
            </Pressable>
          );
        })}
        {ordered.length === 0 && (
          <Text size="sm" tone="muted" className="px-3 py-6 text-center">
            No language matches “{query.trim()}”.
          </Text>
        )}
      </View>
    </Sheet>
  );
}

function LanguageFilter() {
  const [filter, setFilter] = useFeedLangFilter();
  const picker = useSheet();
  const mode = filter?.langMode ?? "show";
  const chosen = new Set(filter?.langs.split(",").filter(Boolean) ?? []);
  const write = (langs: Set<string>, nextMode = mode) =>
    setFilter(langs.size ? { langMode: nextMode, langs: [...langs].join(",") } : null);
  const toggle = (code: string) => {
    const next = new Set(chosen);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    write(next);
  };

  return (
    <SettingsSection title="Feed languages" footer="Applies to the Local and Global timelines.">
      <View className="gap-3 p-4">
        <PillTabs
          tabs={[
            { value: "show", label: "Only show" },
            { value: "hide", label: "Hide" },
          ]}
          value={mode}
          onChange={(next) => write(chosen, next)}
        />
        {chosen.size === 0 ? (
          <Text size="sm" tone="muted">
            All languages are shown.
          </Text>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {[...chosen].map((code) => (
              <Pressable
                key={code}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${LANGUAGES.find((l) => l.code === code)?.name ?? code}`}
                onPress={() => toggle(code)}
                className="h-8 flex-row items-center gap-1.5 rounded-full bg-muted pr-2.5 pl-3 active:opacity-70"
              >
                <Text size="sm" weight="medium">
                  {LANGUAGES.find((l) => l.code === code)?.name ?? code}
                </Text>
                <Icon name="x" size={14} className="text-muted-foreground" />
              </Pressable>
            ))}
          </View>
        )}
        <Button variant="outline" size="sm" className="self-start" icon="languages" onPress={picker.present}>
          {chosen.size ? "Change languages" : "Choose languages"}
        </Button>
      </View>
      <LanguagePicker sheetRef={picker.ref} chosen={chosen} onToggle={toggle} onClear={() => write(new Set())} />
    </SettingsSection>
  );
}

function FollowedTags() {
  const api = useApi();
  const queryClient = useQueryClient();
  const tags = useQuery({ queryKey: queryKeys.followedTags, queryFn: async () => (await api.followedTags()).tags });
  const unfollow = useMutation({
    mutationFn: (slug: string) => api.unfollowTag(slug),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.followedTags }),
  });
  if (!tags.data?.length) return null;
  return (
    <SettingsSection title="Followed tags">
      {tags.data.map((tag) => (
        <SettingsRow
          key={tag.slug}
          icon="hash"
          label={tag.name}
          trailing={
            <Button size="xs" variant="outline" onPress={() => unfollow.mutate(tag.slug)}>
              Unfollow
            </Button>
          }
        />
      ))}
    </SettingsSection>
  );
}

// Refetched each time the screen opens, behind the cached values it shows at once.
const REFRESH = [queryKeys.me, queryKeys.followedTags];

export default function Preferences() {
  useRefreshOnFocus(REFRESH);
  const api = useApi();
  const queryClient = useQueryClient();
  const { theme, hasAdaptiveThemes } = useUniwind();
  const { user } = useViewer();
  const [defaultFeed, setDefaultFeed] = useDefaultFeed();
  const [themePref, setThemePref] = useState<ThemePreference>(
    hasAdaptiveThemes || theme !== "dark" ? (hasAdaptiveThemes ? "system" : "light") : "dark",
  );
  const aiPosts = useMutation({
    mutationFn: (show: boolean) => api.setShowAiAssistedPosts(show),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
      void queryClient.invalidateQueries({ queryKey: ["feed"] });
    },
    onError: (error) => toast(errorMessage(error), "error"),
  });

  return (
    <FormScreen title="Preferences">
      <SettingsSection title="Theme">
        <View className="p-4">
          <PillTabs
            tabs={[
              { value: "light", label: "Light", icon: "sun" },
              { value: "dark", label: "Dark", icon: "moon" },
              { value: "system", label: "System", icon: "monitor" },
            ]}
            value={themePref}
            onChange={(pref) => {
              setThemePref(pref);
              setThemePreference(pref);
            }}
          />
        </View>
      </SettingsSection>

      <SettingsSection title="Home opens on">
        <View className="p-4">
          <PillTabs<FeedTab>
            tabs={[
              ...(user ? [{ value: "for-you" as const, label: "For you" }] : []),
              { value: "local", label: "Local" },
              { value: "global", label: "Global" },
            ]}
            value={homeFeed(defaultFeed, user !== null)}
            onChange={setDefaultFeed}
          />
        </View>
      </SettingsSection>

      <LanguageFilter />

      {user && (
        <SettingsSection footer="Posts their authors marked as written with AI help.">
          <SettingsRow
            icon="sparkles"
            label="Show AI-assisted posts"
            trailing={
              <Switch
                checked={user.showAiAssistedPosts}
                onCheckedChange={(show) => aiPosts.mutate(show)}
                label="Show AI-assisted posts"
              />
            }
          />
        </SettingsSection>
      )}
      {user && <FollowedTags />}
    </FormScreen>
  );
}
