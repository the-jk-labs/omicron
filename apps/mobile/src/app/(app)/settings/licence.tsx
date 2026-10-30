import { LegendList } from "@legendapp/list/react-native";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen, ScreenHeader } from "@/components/layout/screen";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { licenceParagraphs, type LicenceParagraph } from "@/lib/licence";
import { LICENCE_TEXT } from "@/lib/licence-text";

const PARAGRAPHS = licenceParagraphs(LICENCE_TEXT);

const renderParagraph = ({ item }: { item: LicenceParagraph }) =>
  item.heading ? (
    <Text weight="semibold" className="px-5 pt-5 pb-2">
      {item.text}
    </Text>
  ) : (
    <Text size="sm" tone="alt" className="px-5 pb-3 leading-relaxed">
      {item.text}
    </Text>
  );

/** The app's licence, readable in the app: what it means first, then the full text. */
export default function Licence() {
  const insets = useSafeAreaInsets();
  return (
    <Screen>
      <ScreenHeader title="Licence" />
      <LegendList
        data={PARAGRAPHS}
        keyExtractor={(_item, index) => String(index)}
        renderItem={renderParagraph}
        estimatedItemSize={90}
        ListHeaderComponent={
          <View className="px-4 pt-2 pb-2">
            <Card className="gap-2">
              <Text weight="semibold">Free and open source</Text>
              <Text size="sm" tone="muted" className="leading-relaxed">
                Omicron is licensed under the GNU Affero General Public License, version 3 or later. You may use, study,
                share and change it. Anyone who runs a changed version for others must offer them its source code too.
              </Text>
            </Card>
          </View>
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      />
    </Screen>
  );
}
