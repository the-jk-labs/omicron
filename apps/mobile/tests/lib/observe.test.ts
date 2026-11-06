// @vitest-environment happy-dom
// oxlint-disable typescript/unbound-method -- deliberately partial test doubles
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, renderHook } from "@testing-library/react";
import { Observe } from "expo-observe";
import { describe, expect, test, vi } from "vitest";
import { configureObserve, HIDDEN_ROUTE_PARAMS, useShareDiagnostics } from "@/lib/observe";

vi.mock("expo-observe", () => ({ Observe: { configure: vi.fn<() => void>() } }));

const routes = readdirSync(resolve("src/app"), {
  recursive: true,
  encoding: "utf8",
});
const config = (dispatchingEnabled: boolean) => ({
  dispatchingEnabled,
  integrations: { "expo-router": { filteredParams: HIDDEN_ROUTE_PARAMS } },
});

describe("configureObserve", () => {
  test("a fresh install shares diagnostics, with per-route metrics and the hidden params", () => {
    configureObserve();
    expect(Observe.configure).toHaveBeenCalledExactlyOnceWith(config(true));
  });

  test("hides every dynamic route segment, so a new route can't report what someone opened", () => {
    const dynamic = routes.flatMap((path) => [...path.matchAll(/\[(?:\.\.\.)?(\w+)\]/g)].map((match) => match[1]));
    expect(dynamic).toContain("slug");
    for (const param of dynamic) expect(HIDDEN_ROUTE_PARAMS).toContain(param);
  });
});

describe("useShareDiagnostics", () => {
  test("is on until someone turns it off", () => {
    const { result } = renderHook(() => useShareDiagnostics());
    expect(result.current[0]).toBe(true);
    expect(Observe.configure).not.toHaveBeenCalled();
  });

  test("turning it off stops sending at once and keeps the integration configured", () => {
    const { result } = renderHook(() => useShareDiagnostics());
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(Observe.configure).toHaveBeenCalledExactlyOnceWith(config(false));
  });

  test("the choice holds on the next launch", () => {
    const { result } = renderHook(() => useShareDiagnostics());
    act(() => result.current[1](false));
    vi.mocked(Observe.configure).mockClear();
    configureObserve();
    expect(Observe.configure).toHaveBeenCalledExactlyOnceWith(config(false));
  });

  test("it can be turned back on", () => {
    const { result } = renderHook(() => useShareDiagnostics());
    act(() => result.current[1](false));
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(Observe.configure).toHaveBeenLastCalledWith(config(true));
  });
});

test("the app opts out of Android backup, so a reinstall starts with diagnostics on again", () => {
  expect(readFileSync(resolve("app.config.ts"), "utf8")).toContain("allowBackup: false");
});
