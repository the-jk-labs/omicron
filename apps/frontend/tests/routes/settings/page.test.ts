import { goto, invalidateAll } from "$app/navigation";
import { reading } from "$lib/prefs.svelte";
import { theme } from "$lib/theme.svelte";
import type { User } from "$lib/types";
// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";
import SettingsPage from "../../../src/routes/settings/+page.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

vi.mock(import("$lib/components/AvatarCropper.svelte"), async () => ({
  default: (await import("../../mocks/AvatarCropperStub.svelte")).default,
}));
vi.mock(import("$lib/editor/image"), async (importOriginal) => ({
  ...(await importOriginal()),
  prepareImage: async (file: Blob) => ({ blob: file, type: "image/png" }),
}));
const auth = vi.hoisted(() => ({
  signOut: vi.fn<() => Promise<unknown>>(),
  sendVerificationEmail: vi.fn<(a: unknown) => Promise<unknown>>(),
  changePassword: vi.fn<(a: unknown) => Promise<{ error?: { message?: string } | null }>>(),
  deleteUser: vi.fn<(a: unknown) => Promise<{ error?: { message?: string } | null }>>(),
}));
vi.mock("$lib/auth-client", () => ({ authClient: auth }));
const pwned = vi.hoisted(() => ({ value: false }));
vi.mock(import("$lib/password"), async (importOriginal) => ({
  ...(await importOriginal()),
  isPwnedPasswordClient: async () => pwned.value,
}));

function me(o: Partial<User> = {}): User {
  return {
    id: "u1",
    username: "ada",
    displayName: "Ada",
    bio: "Hi",
    publicEmail: "",
    customSection: "",
    customSectionHtml: "",
    avatarUrl: null,
    isAdmin: false,
    isModerator: false,
    isPrivate: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    tags: [],
    links: [],
    email: "ada@example.com",
    emailVerified: true,
    ...o,
  };
}

let api: ReturnType<typeof fakeFetch>;
function setup(user: User = me(), routes: Parameters<typeof fakeFetch>[0] = {}) {
  api = fakeFetch({
    "PATCH /api/users/me": (req) => req.json().then((b: Partial<User>) => Response.json({ user: { ...user, ...b } })),
    "POST /api/users/me/avatar": { user },
    "DELETE /api/users/me/avatar": { user: { ...user, avatarUrl: null } },
    "PATCH /api/users/me/privacy": { user },
    // Child managers load their own lists; an empty answer keeps them quiet.
    "*": apiError(404),
    ...routes,
  });
  vi.stubGlobal("fetch", api.fetch);
  return render(SettingsPage, { props: { data: { user } as never } });
}

const patchBody = () => api.calls.find((c) => c.method === "PATCH" && c.path === "/api/users/me")?.body;

async function pickPhoto(file = new File([new Uint8Array(10)], "me.png", { type: "image/png" })) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  await fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  pwned.value = false;
  Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => {} });
});

test("Save is disabled until something changes, then sends the whole profile", async () => {
  setup();
  const save = screen.getByRole("button", { name: "Save changes" });
  expect(save).toBeDisabled();
  await fireEvent.input(screen.getByLabelText("Display name"), { target: { value: "Ada L." } });
  expect(save).toBeEnabled();
  await fireEvent.click(save);
  await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
  expect(patchBody()).toEqual({
    displayName: "Ada L.",
    bio: "Hi",
    publicEmail: "",
    customSection: "",
    tags: [],
    links: [],
  });
});

test("links are saved as canonical URLs and blank rows are skipped", async () => {
  setup(me({ links: [{ platform: "github", url: "https://github.com/ada", label: "" }] }));
  expect(screen.getByPlaceholderText("username")).toHaveValue("ada");
  await fireEvent.click(screen.getByRole("button", { name: /Add link/ }));
  await fireEvent.input(screen.getByPlaceholderText("username"), { target: { value: "lovelace" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(patchBody()).toBeDefined());
  expect((patchBody() as { links: unknown }).links).toEqual([
    { platform: "github", url: "https://github.com/lovelace", label: "" },
  ]);
});

test("an invalid link names the platform and saves nothing", async () => {
  setup(me({ links: [{ platform: "website", url: "https://ada.example", label: "" }] }));
  await fireEvent.input(screen.getByPlaceholderText("https://example.com"), { target: { value: "not a url" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText(/^Enter a valid .+ web address\.$/);
  expect(patchBody()).toBeUndefined();
});

test("a server refusal is shown", async () => {
  setup(me(), { "PATCH /api/users/me": apiError(400, "Display name taken") });
  await fireEvent.input(screen.getByLabelText("Display name"), { target: { value: "Bob" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText("Display name taken");
});

test("after a save the refreshed data clears the dirty state and says Saved", async () => {
  const { rerender } = setup();
  await fireEvent.input(screen.getByLabelText("Display name"), { target: { value: "Ada L." } });
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
  await rerender({ data: { user: me({ displayName: "Ada L." }) } as never });
  await screen.findByText("Saved.");
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
});

test("after saving a tag change the form is no longer dirty", async () => {
  const { rerender } = setup();
  const tags = screen.getByPlaceholderText(/^Add (tags|another tag)/);
  await fireEvent.input(tags, { target: { value: "deno" } });
  await fireEvent.keyDown(tags, { key: "Enter" });
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
  await rerender({ data: { user: me({ tags: [{ slug: "deno", name: "deno" }] }) } as never });
  await screen.findByText("Saved.", undefined, { timeout: 500 });
});

// The server stores the canonical URL, not what was typed.
test("after saving a link typed without its scheme the form is no longer dirty", async () => {
  const { rerender } = setup(me({ links: [{ platform: "website", url: "https://old.example/", label: "" }] }));
  await fireEvent.input(screen.getByPlaceholderText("https://example.com"), { target: { value: "ada.example" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
  expect(patchBody()).toMatchObject({ links: [{ platform: "website", url: "https://ada.example/", label: "" }] });
  await rerender({
    data: { user: me({ links: [{ platform: "website", url: "https://ada.example/", label: "" }] }) } as never,
  });
  await screen.findByText("Saved.", undefined, { timeout: 500 });
});

test("a picked photo goes through the cropper and uploads on save", async () => {
  setup();
  await pickPhoto();
  await fireEvent.click(await screen.findByRole("button", { name: "Apply crop" }));
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(patchBody()).toBeDefined());
  const upload = api.calls.find((c) => c.path === "/api/users/me/avatar");
  expect(upload?.method).toBe("POST");
  expect(upload?.headers.get("content-type")).toBe("image/png");
});

test.for([
  [new File(["x"], "notes.txt", { type: "text/plain" }), "Please choose an image file."],
  [
    new File([new Uint8Array(26 * 1024 * 1024)], "huge.png", { type: "image/png" }),
    "Image too large. Please choose a file under 25 MB.",
  ],
] as const)("a bad pick (%#) is refused before cropping", async ([file, message]) => {
  setup();
  await pickPhoto(file);
  await screen.findByText(message);
  expect(screen.queryByRole("button", { name: "Apply crop" })).toBe(null);
});

test("an oversized photo after compression is refused without uploading", async () => {
  setup();
  await pickPhoto();
  await fireEvent.click(await screen.findByRole("button", { name: "Apply crop" }));
  vi.spyOn(await import("$lib/editor/image"), "prepareImage").mockResolvedValueOnce({
    blob: new Blob([new Uint8Array(3 * 1024 * 1024)]),
    type: "image/jpeg",
  });
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText(/Image too large \(max 2 MB\) even after compression/);
  expect(api.calls.some((c) => c.path === "/api/users/me/avatar")).toBe(false);
});

test("an invalid link stops the save before the photo is uploaded", async () => {
  setup(me({ links: [{ platform: "website", url: "https://ada.example", label: "" }] }));
  await pickPhoto();
  await fireEvent.click(await screen.findByRole("button", { name: "Apply crop" }));
  await fireEvent.input(screen.getByPlaceholderText("https://example.com"), { target: { value: "not a url" } });
  await fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await screen.findByText(/^Enter a valid .+ web address\.$/);
  expect(api.calls.some((c) => c.path === "/api/users/me/avatar")).toBe(false);
});

test("Remove discards a staged photo without a request, or removes the saved one", async () => {
  setup(me({ avatarUrl: "/media/a.png" }));
  await pickPhoto();
  await fireEvent.click(await screen.findByRole("button", { name: "Apply crop" }));
  await fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
  expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

  await fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
  await waitFor(() =>
    expect(api.calls.some((c) => c.method === "DELETE" && c.path === "/api/users/me/avatar")).toBe(true),
  );
  await waitFor(() => expect(invalidateAll).toHaveBeenCalled());
});

test("a failed photo removal is shown", async () => {
  setup(me({ avatarUrl: "/media/a.png" }), { "DELETE /api/users/me/avatar": apiError(500, "Storage down") });
  await fireEvent.click(screen.getByRole("button", { name: /Remove/ }));
  await screen.findByText("Storage down");
});

test("theme and default feed apply immediately", async () => {
  setup();
  const setTheme = vi.spyOn(theme, "set");
  const setFeed = vi.spyOn(reading, "setDefaultFeed");
  await fireEvent.click(screen.getByRole("button", { name: /Dark/ }));
  await fireEvent.click(screen.getByRole("button", { name: /Local/ }));
  expect(setTheme).toHaveBeenCalledWith("dark");
  expect(setFeed).toHaveBeenCalledWith("local");
});

test("the private switch saves, and flips back when the server refuses", async () => {
  setup(me(), { "PATCH /api/users/me/privacy": apiError(500) });
  const toggle = screen.getByRole("switch", { name: "Private account" });
  expect(toggle).toHaveAttribute("aria-checked", "false");
  await fireEvent.click(toggle);
  await waitFor(() =>
    expect(api.calls.find((c) => c.path === "/api/users/me/privacy")?.body).toEqual({ isPrivate: true }),
  );
  await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
});

test("an unverified email can resend its link", async () => {
  auth.sendVerificationEmail.mockResolvedValue({});
  setup(me({ emailVerified: false }));
  expect(screen.getByText("Unverified")).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Resend link" }));
  await screen.findByText("Verification link sent.");
  expect(auth.sendVerificationEmail).toHaveBeenCalledWith({ email: "ada@example.com", callbackURL: "/verify-email" });
});

test("signing out reloads the session and goes home", async () => {
  auth.signOut.mockResolvedValue({});
  setup();
  await fireEvent.click(screen.getByRole("button", { name: /Sign out/ }));
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
  expect(invalidateAll).toHaveBeenCalled();
});

async function openPasswordDialog() {
  await fireEvent.click(screen.getByRole("button", { name: /Change password/ }));
  await screen.findByRole("dialog");
}

async function fillPasswords(current: string, next: string, confirm = next) {
  await fireEvent.input(screen.getByLabelText("Current password"), { target: { value: current } });
  await fireEvent.input(screen.getByLabelText("New password"), { target: { value: next } });
  await fireEvent.input(screen.getByLabelText("Confirm new password"), { target: { value: confirm } });
  await fireEvent.click(screen.getByRole("button", { name: "Update password" }));
}

const GOOD = "A-much-longer-passphrase-1";

test("changing the password signs out other sessions and confirms", async () => {
  auth.changePassword.mockResolvedValue({ error: null });
  setup();
  await openPasswordDialog();
  await fillPasswords("old-password", GOOD);
  await screen.findByText("Password updated.");
  expect(auth.changePassword).toHaveBeenCalledWith({
    currentPassword: "old-password",
    newPassword: GOOD,
    revokeOtherSessions: true,
  });
  expect(screen.queryByRole("dialog")).toBe(null);
});

test.for([
  ["too short", "short", "short", /at least 12 characters/],
  ["mismatched", GOOD, `${GOOD}!`, /don't match/],
] as const)("a %s new password is refused locally", async ([, next, confirm, message]) => {
  setup();
  await openPasswordDialog();
  await fillPasswords("old-password", next, confirm);
  await screen.findByText(message);
  expect(auth.changePassword).not.toHaveBeenCalled();
});

test("a breached new password is refused", async () => {
  pwned.value = true;
  setup();
  await openPasswordDialog();
  await fillPasswords("old-password", GOOD);
  await screen.findByText(/appeared in a data breach/);
  expect(auth.changePassword).not.toHaveBeenCalled();
});

test("a wrong current password keeps the dialog open with the reason", async () => {
  auth.changePassword.mockResolvedValue({ error: { message: "Invalid password" } });
  setup();
  await openPasswordDialog();
  await fillPasswords("wrong", GOOD);
  await screen.findByText("Invalid password");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("deleting the account needs the password, then goes home", async () => {
  auth.deleteUser.mockResolvedValue({ error: null });
  setup();
  await fireEvent.click(screen.getByRole("button", { name: /Delete account/ }));
  const confirmBtn = await screen.findByRole("button", { name: "Delete forever" });
  await fireEvent.input(screen.getByLabelText("Password"), { target: { value: "pw" } });
  await fireEvent.click(confirmBtn);
  await waitFor(() => expect(goto).toHaveBeenCalledWith("/"));
  expect(auth.deleteUser).toHaveBeenCalledWith({ password: "pw" });
});

test("a refused or failed delete is shown", async () => {
  auth.deleteUser.mockResolvedValueOnce({ error: { message: "Invalid password" } });
  auth.deleteUser.mockRejectedValueOnce(new Error("Failed to fetch"));
  setup();
  await fireEvent.click(screen.getByRole("button", { name: /Delete account/ }));
  await screen.findByRole("dialog");
  await fireEvent.input(screen.getByLabelText("Password"), { target: { value: "pw" } });
  const confirmBtn = screen.getByRole("button", { name: "Delete forever" });
  await fireEvent.click(confirmBtn);
  await screen.findByText("Invalid password");
  await fireEvent.click(confirmBtn);
  await screen.findByText("Failed to fetch");
  expect(goto).not.toHaveBeenCalled();
});
