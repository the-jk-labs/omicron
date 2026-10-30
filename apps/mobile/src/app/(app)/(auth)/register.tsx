import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { AuthShell, FormError } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { PasswordStrength } from "@/components/auth/password-strength";
import { useInstance } from "@/components/instance-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Field, Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAutofillFields } from "@/hooks/use-autofill-fields";
import type { InstanceAuthClient } from "@/lib/auth/auth-client";
import { isPwnedPassword, MIN_PASSWORD_LEN } from "@/lib/auth/password";
import { validateRegisterForm, type RegisterForm } from "@/lib/auth/register-form";
import { useSessionChanged } from "@/lib/auth/session";
import { useInstanceInfo } from "@/lib/query/instance";

const EMPTY: RegisterForm = {
  username: "",
  email: "",
  displayName: "",
  password: "",
  confirmPassword: "",
  acceptTerms: false,
};

type SignUp = {
  email: string;
  username: string;
  password: string;
  name: string;
  verificationRequired: boolean;
  onSignedIn: () => Promise<void>;
};
type SignUpOutcome =
  | { kind: "signed-in" }
  | { kind: "pending" }
  | { kind: "pwned" }
  | { kind: "taken" }
  | { kind: "error"; message: string };

// Outside the component: the React Compiler can't optimise a try/catch holding conditionals.
async function createAccount(auth: InstanceAuthClient, signUp: SignUp): Promise<SignUpOutcome> {
  try {
    if ((await isPwnedPassword(signUp.password)) === true) return { kind: "pwned" };
    const { email, password, name, username } = signUp;
    const res = await auth.signUp.email({ email, password, name, username });
    if (res.error) {
      if (res.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return { kind: "taken" };
      return { kind: "error", message: res.error.message ?? "Something went wrong." };
    }
    // With confirmation required the account exists but has no session yet.
    if (signUp.verificationRequired) return { kind: "pending" };
    await signUp.onSignedIn();
    return { kind: "signed-in" };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export default function Register() {
  const { auth, name } = useInstance();
  const { data: instance } = useInstanceInfo();
  const sessionChanged = useSessionChanged();
  const autofill = useAutofillFields();
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState<Partial<Record<keyof RegisterForm, boolean>>>({});
  // The verdict is kept with the password it was for, so an edit invalidates it without an effect.
  const [breach, setBreach] = useState<{ password: string; pwned: boolean | null } | null>(null);
  const pwned = breach?.password === form.password ? breach.pwned : null;
  const [takenEmail, setTakenEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [resent, setResent] = useState(false);

  // Fail closed: an instance that doesn't say otherwise requires confirmation (the backend default).
  const verificationRequired = instance?.emailVerificationRequired !== false;
  const errors = validateRegisterForm(form, pwned, takenEmail);
  const shown = (key: keyof RegisterForm) => (touched[key] || form[key] ? errors[key] : undefined);
  const set =
    <K extends keyof RegisterForm>(key: K) =>
    (value: RegisterForm[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
      setTouched((current) => ({ ...current, [key]: true }));
    };

  // Debounced breach check, as on the web; it never blocks typing and fails open.
  useEffect(() => {
    const password = form.password;
    if (password.length < MIN_PASSWORD_LEN) return undefined;
    const timer = setTimeout(() => {
      void isPwnedPassword(password).then((result) => setBreach({ password, pwned: result }));
    }, 600);
    return () => clearTimeout(timer);
  }, [form.password]);

  const submit = async () => {
    setTouched({ username: true, email: true, password: true, confirmPassword: true, acceptTerms: true });
    if (Object.keys(errors).length > 0) return;
    setError(null);
    setBusy(true);
    const email = form.email.trim().toLowerCase();
    const username = form.username.trim().toLowerCase();
    const outcome = await createAccount(auth, {
      email,
      username,
      password: form.password,
      name: form.displayName.trim() || username,
      verificationRequired,
      onSignedIn: sessionChanged,
    });
    if (outcome.kind === "signed-in") {
      router.dismissTo("/");
      return;
    }
    if (outcome.kind === "pending") {
      setRegisteredEmail(email);
      return;
    }
    if (outcome.kind === "pwned") setBreach({ password: form.password, pwned: true });
    else if (outcome.kind === "taken") setTakenEmail(email);
    else setError(outcome.message);
    setBusy(false);
  };

  if (registeredEmail) {
    return (
      <AuthShell title="Check your inbox">
        <View className="items-center gap-4">
          <View className="bg-muted size-14 items-center justify-center rounded-full">
            <Icon name="mail" size={26} />
          </View>
          <Text size="sm" tone="muted" className="text-center">
            Your account is created. Click the confirmation link we sent to{" "}
            <Text size="sm" weight="medium">
              {registeredEmail}
            </Text>{" "}
            to activate it, then sign in. The link expires in 24 hours.
          </Text>
          {resent && (
            <Text size="xs" tone="muted">
              A fresh link is on its way.
            </Text>
          )}
        </View>
        <View className="gap-2">
          <Button
            variant="outline"
            onPress={() =>
              void auth.sendVerificationEmail({ email: registeredEmail }).then((res) => setResent(!res.error))
            }
          >
            Resend confirmation link
          </Button>
          <Button variant="solid" onPress={() => router.dismissTo("/sign-in")}>
            Back to sign in
          </Button>
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle={
        instance?.federationEnabled
          ? `Join ${name} and follow writers across the fediverse.`
          : `Join ${name} and start writing.`
      }
    >
      <View className="gap-4">
        <Field label="Username" hint="Permanent: it's your address on the fediverse." error={shown("username")}>
          <Input
            {...autofill("username")}
            value={form.username}
            onChangeText={(text) => set("username")(text.toLowerCase())}
            placeholder="ada"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            invalid={Boolean(shown("username"))}
          />
        </Field>
        <Field label="Email" error={shown("email")}>
          <Input
            {...autofill("email")}
            value={form.email}
            onChangeText={set("email")}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            invalid={Boolean(shown("email"))}
          />
        </Field>
        <Field label="Display name" hint="Optional. You can change it any time." error={shown("displayName")}>
          <Input value={form.displayName} onChangeText={set("displayName")} placeholder="Ada Lovelace" />
        </Field>
        <Field label="Password" error={shown("password")}>
          <PasswordInput
            {...autofill("password")}
            value={form.password}
            onChangeText={set("password")}
            placeholder={`At least ${MIN_PASSWORD_LEN} characters`}
            autoComplete="new-password"
            textContentType="newPassword"
            invalid={Boolean(shown("password"))}
          />
        </Field>
        {form.password.length > 0 && <PasswordStrength password={form.password} />}
        <Field label="Confirm password" error={shown("confirmPassword")}>
          <PasswordInput
            {...autofill("confirm")}
            value={form.confirmPassword}
            onChangeText={set("confirmPassword")}
            placeholder="Repeat your password"
            autoComplete="new-password"
            textContentType="newPassword"
            invalid={Boolean(shown("confirmPassword"))}
          />
        </Field>
        <View className="gap-1">
          <Checkbox
            checked={form.acceptTerms}
            onCheckedChange={set("acceptTerms")}
            label={
              <>
                I agree to the{" "}
                <Text size="sm" weight="medium" className="underline" onPress={() => router.push("/instance/privacy")}>
                  Privacy Policy
                </Text>{" "}
                and{" "}
                <Text size="sm" weight="medium" className="underline" onPress={() => router.push("/instance/rules")}>
                  Terms
                </Text>
                .
              </>
            }
          />
          {shown("acceptTerms") && touched.acceptTerms && !form.acceptTerms && (
            <Text size="xs" tone="destructive">
              {errors.acceptTerms}
            </Text>
          )}
        </View>

        <FormError message={error} />
        <Button variant="solid" onPress={() => void submit()} loading={busy}>
          Create account
        </Button>
      </View>

      <View className="flex-row justify-center gap-1">
        <Text size="sm" tone="muted">
          Already have an account?
        </Text>
        <Link href="/sign-in" dismissTo className="text-foreground font-sans-semibold text-sm underline">
          Sign in
        </Link>
      </View>
    </AuthShell>
  );
}
