import { fetch as nitroFetch } from "react-native-nitro-fetch";
import * as z from "zod/mini";
import type { Fetcher } from "@/lib/api/client";

export type InstanceErrorKind = "unreachable" | "not-omicron" | "not-set-up";

export class InstanceError extends Error {
  constructor(public kind: InstanceErrorKind) {
    super(
      {
        unreachable: "Couldn't reach that server. Check the address and your connection.",
        "not-omicron": "That server doesn't look like an Omicron instance.",
        "not-set-up": "That instance hasn't finished its setup yet.",
      }[kind],
    );
    this.name = "InstanceError";
  }
}

async function getJson(fetch: Fetcher, url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" }, credentials: "omit" });
  } catch {
    throw new InstanceError("unreachable");
  }
  if (!res.ok) throw new InstanceError(res.status >= 500 ? "unreachable" : "not-omicron");
  try {
    return await res.json();
  } catch {
    throw new InstanceError("not-omicron");
  }
}

const clientSchema = z.object({ apiVersion: z.literal(1) });
const instanceSchema = z.object({ name: z.string(), setupComplete: z.optional(z.boolean()) });

/** Confirms `origin` runs a compatible Omicron (`/api/client` reports API v1) and returns its identity. */
export async function validateInstance(origin: string, fetch: Fetcher = nitroFetch): Promise<{ name: string }> {
  const [client, info] = await Promise.all([
    getJson(fetch, `${origin}/api/client`),
    getJson(fetch, `${origin}/api/instance`),
  ]);
  const parsed = instanceSchema.safeParse(info);
  if (!clientSchema.safeParse(client).success || !parsed.success) throw new InstanceError("not-omicron");
  if (parsed.data.setupComplete === false) throw new InstanceError("not-set-up");
  return { name: parsed.data.name };
}
