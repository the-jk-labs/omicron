import { describe, expect, test, vi } from "vitest";
import { describeUserAgent } from "@/lib/auth/account";
import { appUserAgent, withUserAgent } from "@/lib/user-agent";

describe("appUserAgent", () => {
  test("names the app, its version, the system and the model", () => {
    expect(appUserAgent("0.1.0", "Android", "16", "SM-S938B")).toBe("Omicron/0.1.0 (Android 16; SM-S938B)");
    expect(appUserAgent("0.1.0", "iOS", "18.1")).toBe("Omicron/0.1.0 (iOS 18.1)");
    expect(appUserAgent(null, "Android", "16")).toBe("Omicron/0 (Android 16)");
  });

  test("reads back as the app on its system in the sessions list", () => {
    expect(describeUserAgent(appUserAgent("0.1.0", "Android", "16", "SM-S938B"))).toBe("Omicron app on Android");
    expect(describeUserAgent(appUserAgent("0.1.0", "iOS", "18.1"))).toBe("Omicron app on iOS");
  });
});

const ok = () => Promise.resolve(new Response(null));

describe("withUserAgent", () => {
  test("adds the app's User-Agent and keeps the caller's other headers", async () => {
    const inner = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(ok);
    await withUserAgent(inner, "Omicron/1 (Android 16)")("https://x.test", {
      method: "POST",
      headers: new Headers({ cookie: "a=b" }),
    });
    expect(inner).toHaveBeenCalledWith("https://x.test", {
      method: "POST",
      headers: { cookie: "a=b", "user-agent": "Omicron/1 (Android 16)" },
    });
  });

  test("leaves a User-Agent the caller set", async () => {
    const inner = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(ok);
    await withUserAgent(inner, "Omicron/1")("https://x.test", { headers: { "User-Agent": "custom" } });
    expect(inner.mock.calls[0][1]?.headers).toEqual({ "user-agent": "custom" });
  });
});
