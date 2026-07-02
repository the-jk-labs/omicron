// SPDX-License-Identifier: AGPL-3.0-or-later

// Reads a request body into memory while enforcing a hard byte cap that does
// NOT trust the (optional, spoofable, or chunked-and-absent) Content-Length
// header. Returns the buffered bytes, or `null` if the stream exceeds `max`.
//
// This consumes the body stream, so a caller that wants to forward the request
// onward (e.g. to Fedify's inbox handler) must rebuild the Request from the
// returned bytes. The declared Content-Length is a cheap first gate elsewhere;
// this is the real bound.
export async function readCappedBody(req: Request, max: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array(0);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
