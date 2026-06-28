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

http
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
