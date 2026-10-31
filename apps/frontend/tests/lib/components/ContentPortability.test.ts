// SPDX-License-Identifier: AGPL-3.0-or-later
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";
import ContentPortability from "#lib/components/ContentPortability.svelte";
import { apiError, fakeFetch } from "../../fakeFetch";

const preview = {
  format: "omicron",
  imageCount: 1,
  warnings: ["Existing posts are never overwritten."],
  items: [
    {
      key: "one",
      title: "New article",
      status: "published",
      createdAt: "2024-01-01T00:00:00Z",
      duplicate: false,
      warnings: ["External images remain linked."],
    },
    {
      key: "two",
      title: "Old article",
      status: "draft",
      createdAt: "2024-01-02T00:00:00Z",
      duplicate: true,
      warnings: [],
    },
  ],
};

function setup(routes: Parameters<typeof fakeFetch>[0] = {}) {
  const f = fakeFetch({
    "POST /api/content/preview": preview,
    "POST /api/content/import": { imported: 1, skipped: 1, failed: [] },
    ...routes,
  });
  vi.stubGlobal("fetch", f.fetch);
  render(ContentPortability);
  return f;
}

async function choose(name = "backup.zip") {
  await fireEvent.change(screen.getByLabelText("Export file"), {
    target: { files: [new File(["archive bytes"], name, { type: "application/zip" })] },
  });
}

test("requires a file and preview before importing, then defaults to drafts", async () => {
  const { calls } = setup();
  expect(screen.getByRole("button", { name: "Preview import" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: /Import \d+ posts/ })).toBeNull();
  await choose();
  await fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  await waitFor(() => screen.getByText("New article"));
  expect(screen.getByText(/1 new posts, 1 duplicates, 1 bundled images/)).toBeInTheDocument();
  expect(screen.getByText(/Already imported; skipped/)).toBeInTheDocument();
  expect(screen.getByRole("checkbox")).not.toBeChecked();
  await fireEvent.click(screen.getByRole("button", { name: "Import 1 posts" }));
  await waitFor(() => screen.getByRole("status"));
  expect(calls.at(-1)?.path).toBe("/api/content/import?preservePublished=false");
  expect(screen.getByRole("status")).toHaveTextContent("1 imported, 1 skipped, 0 failed.");
  expect(screen.getByRole("link", { name: "Manage your posts" })).toHaveAttribute("href", "/posts/manage");
});

test("publication requires explicit opt-in and shows an immediate-publication warning", async () => {
  const { calls } = setup();
  await choose();
  await fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  await waitFor(() => screen.getByRole("checkbox"));
  await fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByText(/will go live immediately/)).toBeInTheDocument();
  await fireEvent.click(screen.getByRole("button", { name: "Import 1 posts" }));
  await waitFor(() => screen.getByRole("status"));
  expect(calls.at(-1)?.path).toBe("/api/content/import?preservePublished=true");
});

test("a different file invalidates the preview and resets publication opt-in", async () => {
  setup();
  await choose();
  await fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  await waitFor(() => screen.getByRole("checkbox"));
  await fireEvent.click(screen.getByRole("checkbox"));
  await choose("different.zip");
  expect(screen.queryByRole("checkbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "Import 1 posts" })).toBeNull();
  await fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  await waitFor(() => screen.getByRole("checkbox"));
  expect(screen.getByRole("checkbox")).not.toBeChecked();
});

test("shows preview errors without offering an import", async () => {
  setup({ "POST /api/content/preview": apiError(400, "Invalid archive") });
  await choose();
  await fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Invalid archive"));
  expect(screen.queryByRole("checkbox")).toBeNull();
});

test("reports partial failure and explains safe retries", async () => {
  setup({
    "POST /api/content/import": {
      imported: 0,
      skipped: 1,
      failed: [{ title: "New article", error: "Storage quota reached" }],
    },
  });
  await choose();
  await fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  await waitFor(() => screen.getByRole("checkbox"));
  await fireEvent.click(screen.getByRole("button", { name: "Import 1 posts" }));
  await waitFor(() => screen.getByRole("status"));
  expect(screen.getByRole("status")).toHaveTextContent("Storage quota reached");
  expect(screen.getByRole("status")).toHaveTextContent("retry the same file");
});

test("a failed import invalidates its preview so retry checks duplicates again", async () => {
  setup({ "POST /api/content/import": apiError(503, "Temporarily unavailable") });
  await choose();
  await fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  await waitFor(() => screen.getByRole("checkbox"));
  await fireEvent.click(screen.getByRole("button", { name: "Import 1 posts" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Temporarily unavailable"));
  expect(screen.queryByRole("checkbox")).toBeNull();
});

test("duplicate-only previews cannot be imported", async () => {
  setup({ "POST /api/content/preview": { ...preview, items: [preview.items[1]] } });
  await choose();
  await fireEvent.click(screen.getByRole("button", { name: "Preview import" }));
  await waitFor(() => screen.getByRole("button", { name: "Import 0 posts" }));
  expect(screen.getByRole("button", { name: "Import 0 posts" })).toBeDisabled();
});

test("rejects oversized files without sending them", async () => {
  const { fetch } = setup();
  const file = new File(["x"], "huge.zip");
  Object.defineProperty(file, "size", { value: 50 * 1024 * 1024 + 1 });
  await fireEvent.change(screen.getByLabelText("Export file"), { target: { files: [file] } });
  expect(screen.getByRole("alert")).toHaveTextContent("50 MB");
  expect(screen.getByRole("button", { name: "Preview import" })).toBeDisabled();
  expect(fetch).not.toHaveBeenCalled();
});

test("export surfaces server errors and re-enables download", async () => {
  setup({ "GET /api/content/export": apiError(400, "An image is missing") });
  await fireEvent.click(screen.getByRole("button", { name: "Download content" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("An image is missing"));
  expect(screen.getByRole("button", { name: "Download content" })).toBeEnabled();
});

test("downloads the exported ZIP and releases its temporary browser URL", async () => {
  vi.useFakeTimers();
  const create = vi.fn<() => string>(() => "blob:content-export");
  const revoke = vi.fn<(url: string) => void>();
  const previous = ["createObjectURL", "revokeObjectURL"].map(
    (name) => [name, Object.getOwnPropertyDescriptor(URL, name)] as const,
  );
  Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe("omicron-content.zip");
    expect(this.href).toBe("blob:content-export");
  });
  try {
    setup({ "GET /api/content/export": new Response("ZIP bytes", { headers: { "content-type": "application/zip" } }) });
    await fireEvent.click(screen.getByRole("button", { name: "Download content" }));
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(revoke).toHaveBeenCalledWith("blob:content-export");
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(URL, name, descriptor);
      else Reflect.deleteProperty(URL, name);
    }
    click.mockRestore();
    vi.useRealTimers();
  }
});
