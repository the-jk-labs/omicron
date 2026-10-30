import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { View } from "react-native";
import { FormError } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { useInstance } from "@/components/instance-provider";
import { FormScreen } from "@/components/settings/form-screen";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAutofillFields } from "@/hooks/use-autofill-fields";
import { confirmPassword, emailChangeError, needsPassword } from "@/lib/auth/account";
import { useViewer } from "@/lib/auth/session";
import { goBack } from "@/lib/navigation";
import { queryKeys } from "@/lib/query/keys";

type Step =
  | { name: "password"; notice?: string }
  | { name: "email" }
  | { name: "code"; sentTo: string }
  | { name: "done"; email: string };

const STALE_PASSWORD = "It's been a while. Confirm your password again to continue.";

/** Runs one step's request: resolves to the error to show, or null when the step moved on. */
function useStepAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<string | null>) => {
    setError(null);
    setBusy(true);
    const problem = await action().catch(() => "Something went wrong.");
    setBusy(false);
    setError(problem);
  };
  return { busy, error, run };
}

function PasswordStep({ notice, onConfirmed }: { notice?: string; onConfirmed: () => void }) {
  const { auth } = useInstance();
  const { user } = useViewer();
  const [password, setPassword] = useState("");
  const autofill = useAutofillFields();
  const { busy, error, run } = useStepAction();
  const submit = () =>
    run(async () => {
      const failed = await confirmPassword(auth, user?.username ?? "", password);
      if (!failed) onConfirmed();
      return failed;
    });
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

/** Asks for a code at `to`; resolves to the error to show, or null once sent. */
function useSendCode(onStalePassword: () => void) {
  const { auth } = useInstance();
  return async (to: string) => {
    const res = await auth.emailOtp.requestEmailChange({ newEmail: to });
    if (!res.error) return null;
    if (needsPassword(res.error)) onStalePassword();
    return needsPassword(res.error) ? null : emailChangeError(res.error);
  };
}

function EmailStep({ onSent, onStalePassword }: { onSent: (to: string) => void; onStalePassword: () => void }) {
  const { user } = useViewer();
  const [email, setEmail] = useState("");
  const autofill = useAutofillFields();
  const sendCode = useSendCode(onStalePassword);
  const { busy, error, run } = useStepAction();
  const submit = () =>
    run(async () => {
      const to = email.trim().toLowerCase();
      if (to === user?.email?.toLowerCase()) return "That's already your email.";
      const problem = await sendCode(to);
      if (!problem) onSent(to);
      return problem;
    });
  return (
    <>
      <Field label="New email" hint="We'll send a 6-digit code to this address.">
        <Input
          {...autofill("email")}
          value={email}
          onChangeText={setEmail}
          autoFocus
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          placeholder="you@example.com"
        />
      </Field>
      <FormError message={error} />
      <Button variant="solid" loading={busy} disabled={!email.trim()} onPress={() => void submit()}>
        Send code
      </Button>
    </>
  );
}

function CodeStep({
  sentTo,
  onChanged,
  onStalePassword,
}: {
  sentTo: string;
  onChanged: () => void;
  onStalePassword: () => void;
}) {
  const { auth } = useInstance();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const autofill = useAutofillFields();
  const sendCode = useSendCode(onStalePassword);
  const { busy, error, run } = useStepAction();
  const submit = () =>
    run(async () => {
      const res = await auth.emailOtp.changeEmail({ newEmail: sentTo, otp: code });
      if (res.error) {
        if (needsPassword(res.error)) onStalePassword();
        return needsPassword(res.error) ? null : emailChangeError(res.error);
      }
      await auth.revokeOtherSessions().catch(() => undefined);
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      onChanged();
      return null;
    });
  return (
    <>
      <View className="gap-3">
        <Field label="Code" hint={`Sent to ${sentTo}. It expires in 10 minutes.`}>
          <Input
            {...autofill("code")}
            value={code}
            onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 6))}
            autoFocus
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            placeholder="123456"
            className="text-center tracking-[8px]"
          />
        </Field>
        <Button variant="link" size="sm" className="self-start px-0" onPress={() => void run(() => sendCode(sentTo))}>
          Send a new code
        </Button>
      </View>
      <FormError message={error} />
      <Button variant="solid" loading={busy} disabled={code.length !== 6} onPress={() => void submit()}>
        Change email
      </Button>
    </>
  );
}

/** The web's ChangeEmailDialog: confirm the password, enter the new address, then the 6-digit code sent to it. */
export default function ChangeEmail() {
  const [step, setStep] = useState<Step>({ name: "password" });
  // The server re-checks how fresh the password confirmation is on every step.
  const backToPassword = () => setStep({ name: "password", notice: STALE_PASSWORD });

  return (
    <FormScreen title="Change email">
      {step.name === "password" && <PasswordStep notice={step.notice} onConfirmed={() => setStep({ name: "email" })} />}
      {step.name === "email" && (
        <EmailStep onSent={(to) => setStep({ name: "code", sentTo: to })} onStalePassword={backToPassword} />
      )}
      {step.name === "code" && (
        <CodeStep
          sentTo={step.sentTo}
          onChanged={() => setStep({ name: "done", email: step.sentTo })}
          onStalePassword={backToPassword}
        />
      )}
      {step.name === "done" && (
        <>
          <Text>
            Your email is now <Text weight="semibold">{step.email}</Text>. Your other devices were signed out.
          </Text>
          <Button variant="solid" onPress={goBack}>
            Done
          </Button>
        </>
      )}
    </FormScreen>
  );
}
