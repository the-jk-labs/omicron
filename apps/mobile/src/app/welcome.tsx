import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUniwind } from "uniwind";
import { Button } from "@/components/ui/button";
import { Card, Separator } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Field, Input } from "@/components/ui/input";
import { PressableScale } from "@/components/ui/pressable";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { pendingLink } from "@/lib/instance/app-links";
import { hostOf, normalizeOrigin, PRIMARY_INSTANCE } from "@/lib/instance/origin";
import { saveInstance } from "@/lib/instance/store";
import { InstanceError, validateInstance } from "@/lib/instance/validate";
import { useStore } from "@/lib/store";
import logoDark from "../../assets/images/splash-dark.png";
import logoLight from "../../assets/images/splash-light.png";

// Well-known instances offered as one tap. More join this list as the network grows.
const FEATURED = [{ origin: PRIMARY_INSTANCE, description: "The main instance" }];

const LOGO = { light: logoLight, dark: logoDark };

/** First run: choose the instance (the backend) the app connects to. */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const [address, setAddress] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);

  const { theme } = useUniwind();
  const link = useStore(pendingLink);
  const [pending, setPending] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const connect = async (origin: string) => {
    setPending(origin);
    setConnectError(null);
    const failure = await validateInstance(origin).then(
      // Saving re-renders the root layout, which swaps this screen for the app.
      (info) => saveInstance({ origin, name: info.name }),
      (error: unknown) => (error instanceof InstanceError ? error.message : "Something went wrong."),
    );
    if (failure === undefined) return;
    setConnectError(failure);
    setPending(null);
  };

  const submitAddress = () => {
    const origin = normalizeOrigin(address);
    if (!origin) {
      setInputError("Enter an address like omicron.blog.");
      return;
    }
    setInputError(null);
    void connect(origin);
  };

  const error = inputError ?? connectError;

  return (
    <KeyboardAwareScrollView
      className="bg-background flex-1"
      contentContainerClassName="grow justify-center gap-8 px-6"
      contentContainerStyle={{ paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="items-center gap-4">
        <Image source={theme === "dark" ? LOGO.dark : LOGO.light} style={{ width: 88, height: 88 }} />
        <View className="items-center gap-2">
          <Text size="2xl" weight="bold" className="text-center">
            Welcome to Omicron
          </Text>
          <Text tone="muted" className="text-center">
            {link ? `Choose an instance to open the link from ${hostOf(link)}.` : "Choose an instance to get started."}
          </Text>
        </View>
      </View>

      <View className="gap-3">
        {FEATURED.map((instance) => {
          const busy = pending === instance.origin;
          return (
            <PressableScale
              key={instance.origin}
              accessibilityRole="button"
              accessibilityLabel={`Connect to ${hostOf(instance.origin)}`}
              disabled={pending !== null}
              onPress={() => void connect(instance.origin)}
            >
              <Card className="flex-row items-center gap-3">
                <View className="bg-muted size-10 items-center justify-center rounded-full">
                  <Icon name="globe" size={20} />
                </View>
                <View className="flex-1">
                  <Text weight="semibold">{hostOf(instance.origin)}</Text>
                  <Text size="sm" tone="muted">
                    {instance.description}
                  </Text>
                </View>
                {busy ? <Spinner /> : <Icon name="chevron-right" size={18} className="text-muted-foreground" />}
              </Card>
            </PressableScale>
          );
        })}
      </View>

      <View className="flex-row items-center gap-3">
        <Separator className="flex-1" />
        <Text size="xs" tone="muted">
          or
        </Text>
        <Separator className="flex-1" />
      </View>

      <View className="gap-4">
        <Field label="Another instance" error={error}>
          <Input
            value={address}
            onChangeText={(text) => {
              setAddress(text);
              setInputError(null);
            }}
            placeholder="example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
            returnKeyType="go"
            onSubmitEditing={submitAddress}
            invalid={Boolean(error)}
          />
        </Field>
        <Button
          variant="solid"
          onPress={submitAddress}
          loading={pending !== null && pending !== PRIMARY_INSTANCE}
          disabled={!address.trim() || pending !== null}
        >
          Continue
        </Button>
      </View>
    </KeyboardAwareScrollView>
  );
}
