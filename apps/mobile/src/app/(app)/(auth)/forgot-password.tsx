import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AuthShell, FormError } from "@/components/auth/auth-shell";
import { useInstance } from "@/components/instance-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAutofillFields } from "@/hooks/use-autofill-fields";
import { useInstanceInfo } from "@/lib/query/instance";

export default function ForgotPassword() {
  const { auth, origin } = useInstance();
  const { data: instance } = useInstanceInfo();
  const [email, setEmail] = useState("");
  const autofill = useAutofillFields();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // An instance on the `console` mail transport never sends the link; say so instead of a dead end.
  if (instance?.emailEnabled === false) {
    return (
      <AuthShell
        title="Password reset is unavailable"
        subtitle="This instance can't send email yet, so it can't send a reset link. Ask its administrator to reset your password."
      >
        {instance.contactEmail && (
          <Text tone="muted" className="text-center">
            {instance.contactEmail}
          </Text>
        )}
      </AuthShell>
    );
  }

  const submit = async () => {
    setError(null);
    setBusy(true);
    // The link opens the instance's website, where the new password is set.
    const failure = await auth
      .requestPasswordReset({ email: email.trim().toLowerCase(), redirectTo: `${origin}/reset-password` })
      .then(
        (res) => (res.error ? (res.error.message ?? "Something went wrong.") : null),
        (err: unknown) => (err instanceof Error ? err.message : "Something went wrong."),
      );
    if (failure === null) setSent(true);
    else setError(failure);
    setBusy(false);
  };

  if (sent) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle={`If an account uses ${email.trim()}, a reset link is on its way. Open it, choose a new password, then sign in here.`}
      >
        <Button variant="solid" onPress={() => router.replace("/sign-in")}>
          Back to sign in
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="Enter your account's email and we'll send you a reset link.">
      <View className="gap-4">
        <Field label="Email">
          <Input
            {...autofill("email")}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={() => void submit()}
          />
        </Field>
        <FormError message={error} />
        <Button variant="solid" onPress={() => void submit()} loading={busy} disabled={!email.trim()}>
          Send reset link
        </Button>
      </View>
    </AuthShell>
  );
}
