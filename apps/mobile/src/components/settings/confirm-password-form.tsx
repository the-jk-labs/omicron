import { useState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { useInstance } from "@/components/instance-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { useAutofillFields } from "@/hooks/use-autofill-fields";
import { confirmPassword } from "@/lib/auth/account";
import { useViewer } from "@/lib/auth/session";

/** Asks for the password when Better Auth wants a recent sign-in. Confirming starts a fresh session. */
export function ConfirmPasswordForm({
  notice,
  onConfirmed,
}: {
  notice?: string;
  onConfirmed: () => void | Promise<void>;
}) {
  const { auth } = useInstance();
  const { user } = useViewer();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autofill = useAutofillFields();

  const submit = async () => {
    setError(null);
    setBusy(true);
    const failed = await confirmPassword(auth, user?.username ?? "", password).catch(() => "Something went wrong.");
    if (!failed) await onConfirmed();
    setBusy(false);
    setError(failed);
  };

  return (
    <>
      <Field label="Current password" hint={`Signing in as @${user?.username}.`}>
        <PasswordInput
          {...autofill("password")}
          value={password}
          onChangeText={setPassword}
          autoFocus
          autoComplete="current-password"
          textContentType="password"
        />
      </Field>
      <FormError message={error ?? notice ?? null} />
      <Button variant="solid" loading={busy} disabled={!password} onPress={() => void submit()}>
        Continue
      </Button>
    </>
  );
}
