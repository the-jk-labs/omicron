// @vitest-environment happy-dom
import type { User } from "@omicron/contract";
import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useSignOut, useViewer } from "@/lib/auth/session";
import { queryKeys } from "@/lib/query/keys";
import { makeUser } from "../../fixtures";
import { renderQueryHook } from "../../support/query";

// The server knows the session until sign-out ends it.
let session: User | null = null;
const signOut = vi.fn<() => Promise<unknown>>();
const me = vi.fn<() => Promise<{ user: User | null }>>(async () => ({ user: session }));

vi.mock("@/components/instance-provider", () => ({
  useInstance: () => ({ origin: "https://omicron.test", auth: { signOut }, api: { me } }),
}));

beforeEach(() => {
  session = makeUser();
  signOut.mockImplementation(async () => {
    session = null;
    return {};
  });
});

describe("useSignOut", () => {
  // Bug: clearing the cache dropped the query mounted screens were watching, so they kept showing the signed-in
  // tab bar and profile until a navigation remounted them.
  test("screens already on display see the signed-out state at once", async () => {
    const { result } = renderQueryHook(() => ({ viewer: useViewer(), signOut: useSignOut() }));
    await waitFor(() => expect(result.current.viewer.signedIn).toBe(true));

    await act(() => result.current.signOut());

    await waitFor(() => expect(result.current.viewer.signedIn).toBe(false));
    expect(signOut).toHaveBeenCalledOnce();
  });

  test("account data is dropped, so nothing from the session shows to the next one", async () => {
    const { result, queryClient } = renderQueryHook(() => useSignOut());
    queryClient.setQueryData(queryKeys.me, makeUser());
    queryClient.setQueryData(["notifications"], { private: true });

    await act(() => result.current());

    expect(queryClient.getQueryData(["notifications"])).toBeUndefined();
    expect(queryClient.getQueryData(queryKeys.me)).toBeNull();
  });

  test("a failed server sign-out still signs out on the device", async () => {
    signOut.mockRejectedValueOnce(new Error("offline"));
    const { result } = renderQueryHook(() => ({ viewer: useViewer(), signOut: useSignOut() }));
    await waitFor(() => expect(result.current.viewer.signedIn).toBe(true));

    await act(() => result.current.signOut());

    await waitFor(() => expect(result.current.viewer.signedIn).toBe(false));
  });
});
