import { Link, router } from "expo-router";
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
import { useSessionChanged } from "@/lib/auth/session";

type SignInFailure = { message: string; unverified: boolean };

// Outside the component: the React Compiler can't optimise a try/catch holding conditionals.
async function signIn(
  auth: InstanceAuthClient,
  identifier: string,
  password: string,
  onSignedIn: () => Promise<void>,
): Promise<SignInFailure | null> {
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
    await onSignedIn();
    return null;
  } catch (err) {
    return { unverified: false, message: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export default function SignIn() {
  const { auth, name } = useInstance();
  const sessionChanged = useSessionChanged();
  const autofill = useAutofillFields();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

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
    setNeedsVerification(failure.unverified);
    setError(failure.message);
    setBusy(false);
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

  return (
    <AuthShell title={`Sign in to ${name}`}>
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
            <Link href="/forgot-password" className="text-muted-foreground font-sans-medium text-sm underline">
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

      <View className="flex-row justify-center gap-1">
        <Text size="sm" tone="muted">
          New here?
        </Text>
        <Link href="/register" className="text-foreground font-sans-semibold text-sm underline">
          Create an account
        </Link>
      </View>
    </AuthShell>
  );
}
