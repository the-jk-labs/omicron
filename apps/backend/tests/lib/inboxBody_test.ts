// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, test, vi } from "vitest";
import { readCappedBody } from "@/lib/inboxBody.ts";

function streamOf(chunks: Uint8Array[]) {
  const cancel = vi.fn<() => void>();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++]);
      else controller.close();
    },
    cancel,
  });
  return { stream, cancel };
}

function post(body: BodyInit | null): Request {
  return new Request("https://example.test/inbox", { method: "POST", body, duplex: "half" } as RequestInit);
}

describe("readCappedBody", () => {
  test("returns an empty buffer when there is no body", async () => {
    const out = await readCappedBody(new Request("https://example.test/inbox"), 10);
    expect(out).toEqual(new Uint8Array(0));
  });

  test("returns the full body when it is under the cap", async () => {
    const out = await readCappedBody(post("hello"), 10);
    expect(new TextDecoder().decode(out!)).toBe("hello");
  });

  test("accepts a body of exactly the cap", async () => {
    const out = await readCappedBody(post("12345"), 5);
    expect(out?.byteLength).toBe(5);
  });

  test("returns null one byte past the cap", async () => {
    expect(await readCappedBody(post("123456"), 5)).toBe(null);
  });

  test("counts bytes, not characters", async () => {
    // "é" is two UTF-8 bytes, so three of them are six bytes.
    expect(await readCappedBody(post("ééé"), 5)).toBe(null);
    expect((await readCappedBody(post("ééé"), 6))?.byteLength).toBe(6);
  });

  test("concatenates multiple chunks in order", async () => {
    const enc = new TextEncoder();
    const { stream } = streamOf([enc.encode("ab"), enc.encode("cd"), enc.encode("ef")]);
    const out = await readCappedBody(post(stream), 100);
    expect(new TextDecoder().decode(out!)).toBe("abcdef");
  });

  test("skips empty chunks", async () => {
    const enc = new TextEncoder();
    const { stream } = streamOf([enc.encode("a"), new Uint8Array(0), enc.encode("b")]);
    const out = await readCappedBody(post(stream), 100);
    expect(new TextDecoder().decode(out!)).toBe("ab");
  });

  test("cancels the stream as soon as the running total breaches the cap", async () => {
    const { stream, cancel } = streamOf([new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)]);
    expect(await readCappedBody(post(stream), 6)).toBe(null);
    expect(cancel).toHaveBeenCalledOnce();
  });

  test("a cap of zero only accepts an empty body", async () => {
    expect(await readCappedBody(post(""), 0)).toEqual(new Uint8Array(0));
    expect(await readCappedBody(post("x"), 0)).toBe(null);
  });
});
