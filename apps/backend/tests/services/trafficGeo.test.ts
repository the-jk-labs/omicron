// SPDX-License-Identifier: AGPL-3.0-or-later
import { beforeEach, expect, test, vi } from "vitest";
vi.mock(import("maxmind"));
vi.mock(import("@/config.ts"), () => ({ config: { TRAFFIC_GEOIP_PATH: "" } as never }));
import { open } from "maxmind";
import { config } from "@/config.ts";

beforeEach(() => {
  vi.resetModules();
  config.TRAFFIC_GEOIP_PATH = "";
});
test("geography is explicitly unavailable without a local database", async () => {
  const { countryOf, geographyAvailable } = await import("@/services/trafficGeo.ts");
  expect(await geographyAvailable()).toBe(false);
  expect(await countryOf("203.0.113.10")).toBe("Unknown");
  expect(open).not.toHaveBeenCalled();
});
test("only a country code from the local database is returned, not raw lookup data", async () => {
  config.TRAFFIC_GEOIP_PATH = "/geoip/country.mmdb";
  const get = vi.fn<() => object>().mockReturnValue({ country: { iso_code: "US" }, location: { latitude: 30 } });
  vi.mocked(open).mockResolvedValue({ get } as never);
  const { countryOf, geographyAvailable } = await import("@/services/trafficGeo.ts");
  expect(await geographyAvailable()).toBe(true);
  expect(await countryOf("203.0.113.10")).toBe("US");
  expect(await countryOf("invalid")).toBe("Unknown");
  expect(open).toHaveBeenCalledOnce();
});
test("an unreadable database fails closed without repeated attempts or external lookups", async () => {
  config.TRAFFIC_GEOIP_PATH = "/geoip/missing.mmdb";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(open).mockRejectedValue(new Error("not found"));
  const { countryOf, geographyAvailable } = await import("@/services/trafficGeo.ts");
  expect(await geographyAvailable()).toBe(false);
  expect(await countryOf("203.0.113.10")).toBe("Unknown");
  expect(open).toHaveBeenCalledOnce();
});
