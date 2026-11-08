import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ConnectivityBanner } from "./connectivity-banner";
import { UpdateBanner } from "./update-banner";

/** Everything that appears under the status bar, stacked so two at once never cover each other. */
export function TopBanners() {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 gap-2 px-4" style={{ top: insets.top + 6 }}>
      <ConnectivityBanner />
      <UpdateBanner />
    </View>
  );
}
