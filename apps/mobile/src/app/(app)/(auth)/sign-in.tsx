import { Link, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AuthShell, FormError } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { useInstance } from "@/components/instance-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAutofillFields } from "@/hooks/use-autofill-fields";
import type { InstanceAuthClient } from "@/lib/auth/auth-client";
import { isUnverifiedError, parseLoginId } from "@/lib/auth/login";
import { signInWithPasskey, usePasskeysAvailable } from "@/lib/auth/passkeys";
import { useSessionChanged } from "@/lib/auth/session";
import { backupCodeInput, needsSecondStep, totpDigits, verifySecondStep } from "@/lib/auth/two-factor";
import { goBack } from "@/lib/navigation";

type SignInFailure = { message: string; unverified: boolean };

// Outside the component: the React Compiler can't optimise a try/catch holding conditionals.
async function signIn(
  auth: InstanceAuthClient,
  identifier: string,
  password: string,
  onSignedIn: () => Promise<void>,
): Promise<SignInFailure | "two-factor" | null> {
  try {
    const login = parseLoginId(identifier);
    const res =
      login.kind === "email"
        ? await auth.signIn.email({ email: login.value, password })
        : await auth.signIn.username({ username: login.value, password });
    if (res.error) {
      return isUnverifiedError(res.error)
        ? {
            unverified: true,
            message: "Check your inbox to confirm your email before signing in. A fresh link is on its way.",
          }
        : { unverified: false, message: res.error.message ?? "Invalid username or password." };
    }
    if (needsSecondStep(res.data)) return "two-factor";
    await onSignedIn();
    return null;
  } catch (err) {
    return { unverified: false, message: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export default function SignIn() {
  // `welcome`: opened by the app right after the instance was chosen, rather than by the person.
  const { welcome } = useLocalSearchParams<{ welcome?: string }>();
  const { auth, name } = useInstance();
  const sessionChanged = useSessionChanged();
  const autofill = useAutofillFields();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const passkeysAvailable = usePasskeysAvailable();
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");
  // An account with two-factor on answers the password with a second step.
  const [secondStep, setSecondStep] = useState(false);
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);

  const submit = async () => {
    setError(null);
    setNeedsVerification(false);
    setResendState("idle");
    setBusy(true);
    const failure = await signIn(auth, identifier, password, sessionChanged);
    if (!failure) {
      router.dismissTo("/");
      return;
    }
    if (failure === "two-factor") {
      setPassword("");
      setCode("");
      setUseBackupCode(false);
      setSecondStep(true);
      setBusy(false);
      return;
    }
    setNeedsVerification(failure.unverified);
    setError(failure.message);
    setBusy(false);
  };

  const submitCode = async () => {
    setError(null);
    setBusy(true);
    const result = await verifySecondStep(auth, code, useBackupCode, sessionChanged);
    if (result === "signed-in") {
      router.dismissTo("/");
      return;
    }
    setError(result.message);
    if (result.expired) setSecondStep(false);
    setBusy(false);
  };

  const codeReady = useBackupCode ? code.length >= 8 : code.length === 6;

  const submitPasskey = async () => {
    setError(null);
    setNeedsVerification(false);
    setPasskeyBusy(true);
    const result = await signInWithPasskey(auth, sessionChanged);
    if (result === "signed-in") {
      router.dismissTo("/");
      return;
    }
    if (result) setError(result.message);
    setPasskeyBusy(false);
  };

  const resend = async () => {
    // Resending needs the login email; a username alone can't address it.
    const login = parseLoginId(identifier);
    if (login.kind !== "email") {
      setError("Enter your email address above to resend the confirmation link.");
      return;
    }
    setResendState("sending");
    const res = await auth.sendVerificationEmail({ email: login.value }).catch(() => null);
    if (res?.error || !res) {
      setError(res?.error?.message ?? "Something went wrong.");
      setResendState("idle");
      return;
    }
    setResendState("sent");
  };

  if (secondStep) {
    return (
      <AuthShell title="Two-factor authentication" subtitle="Open your authenticator app and enter the code.">
        <View className="gap-4">
          <Field
            label={useBackupCode ? "Backup code" : "Code from your authenticator app"}
            hint={useBackupCode ? "Each backup code works once." : undefined}
          >
            {useBackupCode ? (
              <Input
                value={code}
                onChangeText={(text) => setCode(backupCodeInput(text))}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                importantForAutofill="no"
                onSubmitEditing={() => codeReady && void submitCode()}
              />
            ) : (
              <Input
                {...autofill("otp")}
                value={code}
                onChangeText={(text) => setCode(totpDigits(text))}
                keyboardType="number-pad"
                // Lets 1Password, Bitwarden and the system fill the code they keep for this login.
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={6}
                placeholder="123456"
                className="font-mono tracking-[4px]"
                onSubmitEditing={() => codeReady && void submitCode()}
              />
            )}
          </Field>
          <FormError message={error} />
          <Button variant="solid" onPress={() => void submitCode()} loading={busy} disabled={!codeReady}>
            Verify
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              setUseBackupCode(!useBackupCode);
              setCode("");
              setError(null);
            }}
          >
            {useBackupCode ? "Use your authenticator app" : "Use a backup code"}
          </Button>
          <Button
            variant="ghost"
            onPress={() => {
              setSecondStep(false);
              setError(null);
            }}
          >
            Start over
          </Button>
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`Sign in to ${name}`}
      subtitle="Follow writers, join the conversation and save stories for later."
    >
      <View className="gap-4">
        <Field label="Username or email">
          <Input
            {...autofill("identifier")}
            value={identifier}
            onChangeText={setIdentifier}
            placeholder="you or you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
          />
        </Field>
        <Field
          label="Password"
          right={
            <Link href="/forgot-password" className="font-sans-medium text-sm text-muted-foreground underline">
              Forgot password?
            </Link>
          }
        >
          <PasswordInput
            {...autofill("password")}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
        </Field>

        <FormError message={error} />
        {needsVerification && (
          <Button variant="outline" onPress={() => void resend()} loading={resendState === "sending"}>
            {resendState === "sent" ? "Confirmation link sent" : "Resend confirmation link"}
          </Button>
        )}

        <Button variant="solid" onPress={() => void submit()} loading={busy} disabled={!identifier.trim() || !password}>
          Sign in
        </Button>
      </View>

      {passkeysAvailable && (
        <View className="gap-4">
          <View className="flex-row items-center gap-3">
            <View className="h-px flex-1 bg-border" />
            <Text size="xs" tone="muted">
              or
            </Text>
            <View className="h-px flex-1 bg-border" />
          </View>
          <Button variant="outline" icon="key-round" loading={passkeyBusy} onPress={() => void submitPasskey()}>
            {passkeyBusy ? "Waiting for your passkey…" : "Sign in with a passkey"}
          </Button>
        </View>
      )}

      <View className="flex-row justify-center gap-1">
        <Text size="sm" tone="muted">
          New here?
        </Text>
        <Link href="/register" className="font-sans-semibold text-sm text-foreground underline">
          Create an account
        </Link>
      </View>

      {welcome === "1" && (
        <Button variant="ghost" onPress={goBack}>
          Maybe later
        </Button>
      )}
    </AuthShell>
  );
}
