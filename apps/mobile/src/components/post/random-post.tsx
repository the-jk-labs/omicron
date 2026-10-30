import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { useApi } from "@/components/instance-provider";
import { IconButton } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/lib/dialogs/toast";
import { errorMessage } from "@/lib/errors";
import { postPath } from "@/lib/links";
import { useFeedLangFilter } from "@/lib/prefs";

/** "Surprise me": opens a random post from the instance's Global timeline (the web's dice button). */
export function RandomPostButton() {
  const api = useApi();
  const [langFilter] = useFeedLangFilter();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    try {
      const { post } = await api.randomPost("global", langFilter);
      if (post) router.push(postPath(post));
      else toast("No posts to pick from yet.");
    } catch (error) {
      toast(errorMessage(error), "error");
    }
    setBusy(false);
  };
  if (busy)
    return (
      <View className="size-10 items-center justify-center">
        <Spinner />
      </View>
    );
  return <IconButton icon="dices" label="Surprise me: open a random post" onPress={() => void open()} />;
}
