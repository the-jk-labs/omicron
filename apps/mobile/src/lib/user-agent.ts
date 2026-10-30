import * as Application from "expo-application";
import { Platform } from "react-native";
import { fetch as nitroFetch } from "react-native-nitro-fetch";

/** "Omicron/0.1.0 (Android 16; SM-S938B)": the app names itself, so signed-in device lists can say what it is. */
export function appUserAgent(version: string | null, os: string, osVersion: string, model?: string): string {
  const system = [`${os} ${osVersion}`.trim(), model].filter(Boolean).join("; ");
  return `Omicron/${version ?? "0"} (${system})`;
}

function deviceUserAgent() {
  const version = Application.nativeApplicationVersion;
  if (Platform.OS === "android")
    return appUserAgent(version, "Android", Platform.constants.Release, Platform.constants.Model);
  if (Platform.OS === "ios") return appUserAgent(version, "iOS", Platform.Version);
  return appUserAgent(version, Platform.OS, "");
}

const USER_AGENT = deviceUserAgent();

/** `fetch` with the app's User-Agent, unless the caller set one. The native client's default names only itself. */
export function withUserAgent<I>(
  fetch: (input: I, init?: RequestInit) => Promise<Response>,
  userAgent = USER_AGENT,
): (input: I, init?: RequestInit) => Promise<Response> {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("user-agent")) headers.set("user-agent", userAgent);
    return fetch(input, { ...init, headers: Object.fromEntries(headers.entries()) });
  };
}

/** The native fetch every instance request goes through. */
export const appFetch = withUserAgent(nitroFetch);
