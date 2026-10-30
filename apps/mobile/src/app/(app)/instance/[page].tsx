import { useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInstance } from "@/components/instance-provider";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { HtmlContent } from "@/components/reader/html-content";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/states";
import { Text } from "@/components/ui/text";
import { useInstanceInfo } from "@/lib/query/instance";

const PAGES = {
  about: { title: "About", field: "aboutHtml" },
  rules: { title: "Rules", field: "rulesHtml" },
  privacy: { title: "Privacy policy", field: "privacyPolicyHtml" },
} as const;

/** The instance's own pages (about, rules, privacy), written by its administrator. */
export default function InstancePage() {
  const { page } = useLocalSearchParams<{ page: keyof typeof PAGES }>();
  const { name, origin } = useInstance();
  const insets = useSafeAreaInsets();
  const { data: info, error, refetch } = useInstanceInfo();
  const spec = PAGES[page] ?? PAGES.about;
  const html = info?.[spec.field];

  return (
    <Screen>
      <ScreenHeader title={spec.title} />
      <ScrollView
        contentContainerClassName="gap-4 px-5 py-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {!info ? (
          error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : (
            <LoadingState />
          )
        ) : html ? (
          <HtmlContent html={html} />
        ) : (
          <EmptyState icon="file-text" title={`${name} hasn't written this page yet`} />
        )}
        {info && page === "about" && (
          <View className="border-border gap-2 border-t pt-4">
            {info.contactEmail ? (
              <Text size="sm" tone="muted">
                Contact: {info.contactEmail}
              </Text>
            ) : null}
            {info.abuseEmail ? (
              <Text size="sm" tone="muted">
                Abuse reports: {info.abuseEmail}
              </Text>
            ) : null}
            {info.statusUrl ? (
              <Button
                variant="link"
                size="sm"
                className="self-start px-0"
                onPress={() => void WebBrowser.openBrowserAsync(info.statusUrl!)}
              >
                Service status
              </Button>
            ) : null}
            <Button
              variant="link"
              size="sm"
              className="self-start px-0"
              onPress={() => void WebBrowser.openBrowserAsync(origin)}
            >
              Open {name} on the web
            </Button>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
