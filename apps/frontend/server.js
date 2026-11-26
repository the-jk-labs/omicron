// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Production entrypoint. `adapter-node` ships precompressed (.br/.gz) copies of
// static assets, but it never compresses the dynamically rendered SSR HTML —
// Lighthouse flags that document response as "No compression applied". We wrap
// the adapter's request handler with gzip/brotli compression so the HTML (and
// any other dynamic response) is compressed on the fly. The compression
// middleware skips responses that already carry a Content-Encoding header, so
// precompressed static assets are passed through untouched (no double work).
import http from "node:http";
import compression from "compression";
import { handler } from "./build/handler.js";

const compress = compression();
const port = Number(process.env.PORT) || 3000;

// A floating promise rejected inside a component (e.g. an eager fetch during
// SSR) would otherwise be fatal to the process, taking every request down with
// it — a whole-instance outage caused by one page. Log and keep serving.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

const server = http
  .createServer((req, res) => {
    compress(req, res, () => {
      handler(req, res, () => {
        res.statusCode = 404;
        res.end("Not found");
      });
    });
  })
  .listen(port, () => {
    console.log(`Listening on port ${port}`);
  });

// As a container's PID 1, Node has no default SIGTERM handler, so `docker stop`
// waited its full 10 s and then killed requests mid-flight. Stop accepting,
// let in-flight requests finish, and exit well inside that grace period.
const SHUTDOWN_DEADLINE_MS = Number(process.env.SHUTDOWN_DEADLINE_MS) || 8000;
function shutdown() {
  server.close(() => process.exit(0));
  // Keep-alive connections with no request in flight would hold close() open.
  server.closeIdleConnections();
  setTimeout(() => process.exit(0), SHUTDOWN_DEADLINE_MS).unref();
}
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
