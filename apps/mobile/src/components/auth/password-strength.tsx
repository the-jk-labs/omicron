import { View } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { passwordRequirements, passwordStrength } from "@/lib/auth/password";

/** Strength meter plus the requirement checklist, as on the web's register form. */
export function PasswordStrength({ password }: { password: string }) {
  const strength = passwordStrength(password);
  const fill = useAnimatedStyle(() => ({ width: withTiming(`${strength.score * 25}%`, { duration: 200 }) }));
  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <View className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
          <Animated.View
            className={strength.score >= 3 ? "bg-foreground h-full" : "bg-destructive h-full"}
            style={fill}
          />
        </View>
        <Text size="xs" tone="muted" className="w-12 text-right">
          {strength.label}
        </Text>
      </View>
      <View className="gap-1">
        {passwordRequirements(password).map((req) => (
          <View key={req.id} className="flex-row items-center gap-1.5">
            <Icon
              name={req.ok ? "check" : "x"}
              size={12}
              className={req.ok ? "text-foreground" : "text-muted-foreground"}
            />
            <Text size="xs" tone={req.ok ? "default" : "muted"}>
              {req.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
