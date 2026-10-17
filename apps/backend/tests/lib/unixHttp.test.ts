// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { postUnix } from "@/lib/unixHttp.ts";

test("posts Caddy configuration through a Unix socket and preserves a refusal", async () => {
  const directory = await mkdtemp(join(tmpdir(), "caddy-"));
  const socket = join(directory, "admin.sock");
  const server = createServer(async (req, res) => {
    expect(req.method).toBe("POST");
    expect(req.url).toBe("/load");
    expect(req.headers["content-type"]).toBe("text/caddyfile");
    let body = "";
    for await (const chunk of req) body += chunk;
    expect(body).toBe("example config");
    res.writeHead(400).end("invalid configuration");
  });
  try {
    await new Promise<void>((resolve) => server.listen(socket, resolve));
    const response = await postUnix(socket, "/load", "example config");
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("invalid configuration");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true });
  }
});
