// SPDX-License-Identifier: AGPL-3.0-or-later
import { request } from "node:http";

export function postUnix(socketPath: string, path: string, body: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(
      { socketPath, path, method: "POST", headers: { "content-type": "text/caddyfile" }, agent: false },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          text += chunk;
          if (text.length > 16_384) req.destroy(new Error("Caddy response is too large."));
        });
        res.on("error", reject);
        res.on("end", () => resolve(new Response(text, { status: res.statusCode ?? 502 })));
      },
    );
    const timer = setTimeout(() => req.destroy(new Error("Caddy request timed out.")), 10_000);
    req.on("error", reject);
    req.on("close", () => clearTimeout(timer));
    req.end(body);
  });
}
