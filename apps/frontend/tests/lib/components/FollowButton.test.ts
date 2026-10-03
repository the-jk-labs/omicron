// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import FollowButton from "#lib/components/FollowButton.svelte";
import { fakeFetch } from "../../fakeFetch";

const button = () => screen.getByRole("button");

test.for([
  [{ following: false }, "Follow"],
  [{ following: true }, "Following"],
  [{ following: false, followState: "requested" }, "Requested"],
  [{ following: true, followState: "none" }, "Follow"],
] as const)("%o shows %s", ([props, label]) => {
  render(FollowButton, { props: { username: "ada", ...props } });
  expect(button()).toHaveTextContent(label);
});

test("a local follow takes the state the server reports (a private account → Requested)", async () => {
  const { fetch, calls } = fakeFetch({ "POST /api/users/ada/follow": { ok: true, state: "requested" } });
  vi.stubGlobal("fetch", fetch);
  render(FollowButton, { props: { username: "ada", following: false } });
  await fireEvent.click(button());
  await waitFor(() => expect(button()).toHaveTextContent("Requested"));
  expect(calls[0].path).toBe("/api/users/ada/follow");
});

test("cancelling a request or unfollowing drops back to Follow", async () => {
  vi.stubGlobal("fetch", fakeFetch({ "DELETE /api/users/ada/follow": {} }).fetch);
  render(FollowButton, { props: { username: "ada", following: false, followState: "requested" } });
  await fireEvent.click(button());
  await waitFor(() => expect(button()).toHaveTextContent("Follow"));
});

test("remote accounts go through the federated endpoints", async () => {
  const { fetch, calls } = fakeFetch({
    "POST /api/remote/users/bob%40remote.example/follow": {},
    "DELETE /api/remote/users/bob%40remote.example/follow": {},
  });
  vi.stubGlobal("fetch", fetch);
  render(FollowButton, { props: { username: "bob@remote.example", following: false, remote: true } });
  await fireEvent.click(button());
  await waitFor(() => expect(button()).toHaveTextContent("Following"));
  await fireEvent.click(button());
  await waitFor(() => expect(button()).toHaveTextContent("Follow"));
  expect(calls.map((c) => c.method)).toEqual(["POST", "DELETE"]);
});

test("props re-seed the state when the button is reused for another profile", async () => {
  const { rerender } = render(FollowButton, { props: { username: "ada", following: false } });
  await rerender({ username: "bob", following: true });
  expect(button()).toHaveTextContent("Following");
});
