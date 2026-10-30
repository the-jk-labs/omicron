import { useState } from "react";
import { View } from "react-native";
import { IconButton } from "@/components/ui/button";
import { Input, type InputProps } from "@/components/ui/input";

/** Password field with a show/hide toggle. */
export function PasswordInput(props: Omit<InputProps, "secureTextEntry">) {
  const [visible, setVisible] = useState(false);
  return (
    <View className="justify-center">
      <Input {...props} secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} className="pr-12" />
      <IconButton
        icon={visible ? "eye-off" : "eye"}
        label={visible ? "Hide password" : "Show password"}
        size={18}
        onPress={() => setVisible((v) => !v)}
        className="absolute right-0.5"
      />
    </View>
  );
}
