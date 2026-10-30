import { router } from "expo-router";
import { useState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { useInstance } from "@/components/instance-provider";
import { FormScreen } from "@/components/settings/form-screen";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAutofillFields } from "@/hooks/use-autofill-fields";
import { useSignOut } from "@/lib/auth/session";

export default function DeleteAccount() {
  const { auth, name } = useInstance();
  const signOut = useSignOut();
  const [password, setPassword] = useState("");
  const autofill = useAutofillFields();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setBusy(true);
    const res = await auth.deleteUser({ password }).catch(() => null);
    setBusy(false);
    if (!res || res.error) {
      setError(
        res?.error?.code === "INVALID_PASSWORD"
          ? "Incorrect password."
          : (res?.error?.message ?? "Something went wrong."),
      );
      return;
    }
    await signOut();
    router.dismissTo("/");
  };

  return (
    <FormScreen title="Delete account">
      <Text tone="muted">
        Permanently deletes your account on {name}, with your articles and follows. This can&apos;t be undone.
      </Text>
      <Field label="Password">
        <PasswordInput
          {...autofill("password")}
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
        />
      </Field>
      <FormError message={error} />
      <Button variant="destructive" loading={busy} disabled={!password} onPress={() => void submit()}>
        Delete my account
      </Button>
    </FormScreen>
  );
}
