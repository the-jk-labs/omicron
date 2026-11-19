import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Linking, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { FormError } from "@/components/auth/auth-shell";
import { PasswordInput } from "@/components/auth/password-input";
import { useInstance } from "@/components/instance-provider";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useAutofillFields } from "@/hooks/use-autofill-fields";
import { confirmSetup, startSetup, totpDigits, totpKey, totpQrSvg } from "@/lib/auth/two-factor";

type Step =
  | { name: "password" }
  | { name: "scan"; totpURI: string; backupCodes: string[] }
  | { name: "codes"; backupCodes: string[] };

/**
 * Turns on authenticator-app sign-in: password → add the account to an authenticator (the otpauth link opens one
 * installed on this phone, or a password manager like 1Password or Bitwarden; the QR code is for another device) →
 * confirm a code → save the backup codes. Staff get none: they recover through an admin or the server shell.
 */
export function TwoFactorSetup({ staff, onDone }: { staff: boolean; onDone: () => void }) {
  const { auth } = useInstance();
  const autofill = useAutofillFields();
  const [step, setStep] = useState<Step>({ name: "password" });
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const begin = async () => {
    setError(null);
    setBusy(true);
    const started = await startSetup(auth, password);
    setBusy(false);
    if ("message" in started) {
      setError(started.message);
      return;
    }
    setPassword("");
    setStep({ name: "scan", ...started });
  };

  const confirm = async (totpURI: string, backupCodes: string[]) => {
    setError(null);
    setBusy(true);
    const failure = await confirmSetup(auth, code);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    if (staff || backupCodes.length === 0 || !totpURI) onDone();
    else setStep({ name: "codes", backupCodes });
  };

  const copy = (text: string) => {
    void Clipboard.setStringAsync(text);
    setCopied(true);
  };

  if (step.name === "password") {
    return (
      <View className="gap-4">
        <Text tone="muted">
          You'll need an authenticator app, like Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden or
          Aegis. First, confirm it's you.
        </Text>
        <Field label="Password">
          <PasswordInput
            {...autofill("password")}
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="next"
            onSubmitEditing={() => void begin()}
          />
        </Field>
        <FormError message={error} />
        <Button variant="solid" loading={busy} disabled={!password} onPress={() => void begin()}>
          Continue
        </Button>
      </View>
    );
  }

  if (step.name === "codes") {
    return (
      <View className="gap-4">
        <Text tone="muted">
          Two-factor authentication is on. Save these backup codes somewhere safe: each one signs you in once if you
          lose your phone. They won't be shown again.
        </Text>
        <View className="flex-row flex-wrap gap-y-1.5 rounded-card border border-border-card bg-background-alt p-4">
          {step.backupCodes.map((backupCode) => (
            <Text key={backupCode} className="w-1/2 font-mono">
              {backupCode}
            </Text>
          ))}
        </View>
        <Button variant="outline" icon="copy" onPress={() => copy(step.backupCodes.join("\n"))}>
          {copied ? "Copied" : "Copy codes"}
        </Button>
        <Button variant="solid" onPress={onDone}>
          I've saved them
        </Button>
      </View>
    );
  }

  const key = totpKey(step.totpURI);
  return (
    <View className="gap-4">
      <Text tone="muted">
        Add this account to your authenticator app or password manager, then enter the code it shows.
      </Text>
      <Button
        variant="solid"
        icon="external-link"
        onPress={() => void Linking.openURL(step.totpURI).catch(() => undefined)}
      >
        Open in authenticator app
      </Button>
      <View className="items-center gap-2">
        <View
          className="rounded-card border border-border-card bg-white p-2"
          accessibilityRole="image"
          accessibilityLabel="QR code for your authenticator app"
        >
          <SvgXml xml={totpQrSvg(step.totpURI)} width={176} height={176} />
        </View>
        <Text size="xs" tone="muted" className="text-center">
          Or scan it from another device, or enter this key:
        </Text>
        <Button variant="ghost" icon={copied ? "check" : "copy"} onPress={() => copy(key.replaceAll(" ", ""))}>
          {key}
        </Button>
      </View>
      <Field label="6-digit code from the app">
        <Input
          {...autofill("otp")}
          value={code}
          onChangeText={(text) => setCode(totpDigits(text))}
          keyboardType="number-pad"
          // Lets 1Password, Bitwarden and the system offer the code they just saved.
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={6}
          placeholder="123456"
          className="font-mono tracking-[4px]"
          onSubmitEditing={() => code.length === 6 && void confirm(step.totpURI, step.backupCodes)}
        />
      </Field>
      <FormError message={error} />
      <Button
        variant="solid"
        loading={busy}
        disabled={code.length !== 6}
        onPress={() => void confirm(step.totpURI, step.backupCodes)}
      >
        Turn on
      </Button>
    </View>
  );
}
