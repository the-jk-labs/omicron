import { useQuery } from "@tanstack/react-query";
import * as Application from "expo-application";
import { Platform } from "react-native";
import * as z from "zod/mini";
import { useInstance } from "@/components/instance-provider";
import { queryKeys } from "@/lib/query/keys";
import { appFetch } from "@/lib/user-agent";
import type { InstanceAuthClient } from "./auth-client";

// Ported from apps/frontend/src/lib/passkeys.ts.

type AuthError = { code?: string; message?: string } | null | undefined;

const NOT_ALLOWED = "This instance hasn't enabled passkeys for the app.";
const LOGIN_CREDS = "delegate_permission/common.get_login_creds";
const ANDROID_MIN_API = 28;

const assetLinksSchema = z.array(
  z.object({
    relation: z.array(z.string()),
    target: z.object({ package_name: z.optional(z.string()) }),
  }),
);

const passkeySchema = z.object({
  id: z.string(),
  name: z.nullish(z.string()),
  backedUp: z.boolean(),
  createdAt: z.union([z.string(), z.date()]),
});
const passkeysSchema = z.array(passkeySchema);

export type Passkey = z.infer<typeof passkeySchema>;

/** The device side: Credential Manager needs Android 9. iOS would need each instance's domain built into the app. */
export function deviceSupportsPasskeys() {
  return Platform.OS === "android" && Platform.Version >= ANDROID_MIN_API;
}

/** A passkey belongs to the instance's domain, and Android only offers it to apps that domain names. */
export async function instanceAllowsApp(origin: string, appId = Application.applicationId): Promise<boolean> {
  const res = await appFetch(`${origin}/.well-known/assetlinks.json`);
  if (!res.ok) return false;
  const links = assetLinksSchema.safeParse(await res.json());
  return (
    links.success &&
    links.data.some(({ relation, target }) => target.package_name === appId && relation.includes(LOGIN_CREDS))
  );
}

/** Whether passkey ceremonies can work here, so nothing offers one that would only fail. */
export function usePasskeysAvailable() {
  const { origin } = useInstance();
  const { data } = useQuery({
    queryKey: queryKeys.passkeysAvailable,
    queryFn: () => instanceAllowsApp(origin),
    enabled: deviceSupportsPasskeys(),
    staleTime: 60 * 60 * 1000,
  });
  return data === true;
}

/** The message for a failed passkey sign-in, or null when the person just cancelled it. */
export function passkeySignInError(error: AuthError): string | null {
  const code = error?.code ?? "";
  if (code === "ERROR_CEREMONY_ABORTED" || code === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY") return null;
  if (code === "ERROR_INVALID_RP_ID") return NOT_ALLOWED;
  // Unlike the web, this isn't a cancel: the library reports a device with no passkey this way, with no sheet shown.
  if (code === "AUTH_CANCELLED") return "Couldn't find a passkey for this instance on this device.";
  if (code.startsWith("ERROR_")) return "Passkey sign-in failed. Try again.";
  if (code === "PASSKEY_NOT_FOUND") return "That passkey isn't registered here. It may have been removed.";
  if (code === "AUTHENTICATION_FAILED") return "That passkey couldn't be verified. Try again.";
  return error?.message || "Passkey sign-in failed.";
}

/** The message for a failed passkey registration, or null when the person just cancelled it. */
export function addPasskeyError(error: AuthError): string | null {
  const code = error?.code ?? "";
  if (code === "ERROR_CEREMONY_ABORTED") return null;
  if (code === "ERROR_INVALID_RP_ID") return NOT_ALLOWED;
  if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED")
    return "This device already has a passkey for your account.";
  if (code === "ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY") return "Passkey setup was cancelled or timed out.";
  return error?.message || "Could not add the passkey.";
}

export async function loadPasskeys(auth: InstanceAuthClient): Promise<Passkey[]> {
  const res = await auth.passkey.listUserPasskeys();
  if (res.error) throw new Error(res.error.message ?? "Couldn't load your passkeys.");
  const parsed = passkeysSchema.safeParse(res.data ?? []);
  if (!parsed.success) throw new Error("Couldn't load your passkeys.");
  return parsed.data;
}

export const passkeyLabel = (passkey: Passkey) => passkey.name?.trim() || "Passkey";

/** Runs the system's passkey sheet. Resolves to null when the person just cancelled it. */
export async function signInWithPasskey(
  auth: InstanceAuthClient,
  onSignedIn: () => Promise<void>,
): Promise<"signed-in" | { message: string } | null> {
  try {
    const res = await auth.signIn.passkey();
    if (res.error) {
      const message = passkeySignInError(res.error);
      return message === null ? null : { message };
    }
    await onSignedIn();
    return "signed-in";
  } catch (err) {
    return { message: err instanceof Error ? err.message : "Something went wrong." };
  }
}

export type AddPasskeyResult = "added" | "cancelled" | "needs-password" | { message: string };

/** Runs the system's passkey setup. The caller decides what each outcome shows. */
export async function addPasskey(auth: InstanceAuthClient): Promise<AddPasskeyResult> {
  try {
    const res = await auth.passkey.addPasskey();
    const error: AuthError = res?.error;
    if (!error) return "added";
    if (error.code === "SESSION_NOT_FRESH") return "needs-password";
    const message = addPasskeyError(error);
    return message === null ? "cancelled" : { message };
  } catch (err) {
    return { message: err instanceof Error ? err.message : "Could not add the passkey." };
  }
}
