import { useState } from "react";
import { FormError } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrength } from "@/components/auth/password-strength";
import { useInstance } from "@/components/instance-provider";
import { FormScreen } from "@/components/settings/form-screen";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { useAutofillFields } from "@/hooks/use-autofill-fields";
import { isPwnedPassword, MAX_PASSWORD_LEN, MIN_PASSWORD_LEN } from "@/lib/auth/password";
import { toast } from "@/lib/dialogs/toast";
import { goBack } from "@/lib/navigation";

export default function ChangePassword() {
  const { auth } = useInstance();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const autofill = useAutofillFields();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (next.length < MIN_PASSWORD_LEN) return setError(`Password must be at least ${MIN_PASSWORD_LEN} characters.`);
    if (next.length > MAX_PASSWORD_LEN) return setError(`Password must be at most ${MAX_PASSWORD_LEN} characters.`);
    if (next !== repeat) return setError("Passwords do not match.");
    setError(null);
    setBusy(true);
    const problem = await change().catch(() => "Something went wrong.");
    setBusy(false);
    if (problem) return setError(problem);
    toast("Password changed. Your other devices were signed out.");
    goBack();
  };

  /** Resolves to the error to show, or null once the password is changed. */
  const change = async (): Promise<string | null> => {
    if ((await isPwnedPassword(next)) === true)
      return "This password has appeared in a data breach. Please choose a different one.";
    const res = await auth.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    if (!res.error) return null;
    return res.error.code === "INVALID_PASSWORD"
      ? "Your current password is incorrect."
      : (res.error.message ?? "Something went wrong.");
  };

  return (
    <FormScreen title="Change password">
      <Field label="Current password">
        <PasswordInput
          {...autofill("current")}
          value={current}
          onChangeText={setCurrent}
          autoComplete="current-password"
          textContentType="password"
        />
      </Field>
      <Field label="New password">
        <PasswordInput
          {...autofill("new")}
          value={next}
          onChangeText={setNext}
          autoComplete="new-password"
          textContentType="newPassword"
        />
      </Field>
      {next.length > 0 && <PasswordStrength password={next} />}
      <Field label="Repeat new password">
        <PasswordInput
          {...autofill("repeat")}
          value={repeat}
          onChangeText={setRepeat}
          autoComplete="new-password"
          textContentType="newPassword"
        />
      </Field>
      <FormError message={error} />
      <Button variant="solid" loading={busy} disabled={!current || !next || !repeat} onPress={() => void submit()}>
        Change password
      </Button>
    </FormScreen>
  );
}
