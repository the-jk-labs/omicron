// SPDX-License-Identifier: AGPL-3.0-or-later
// The production entrypoint, run as a real process: a container stop sends it
// SIGTERM, and it must finish what it's serving and exit well inside Docker's
// 10 s grace period instead of being killed at the end of it.
import { type ChildProcess, spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

// Vitest runs from the app directory (import.meta.url isn't a file: URL under jsdom).
const app = process.cwd();

// Stands in for adapter-node's build: /slow answers after 400 ms, /hang never.
const STUB_HANDLER = `export function handler(req, res) {
  if (req.url === "/hang") return;
  const reply = () => res.end("ok");
  if (req.url === "/slow") setTimeout(reply, 400); else reply();
}
`;

const running: { child: ChildProcess; dir: string }[] = [];

afterEach(async () => {
  for (const { child, dir } of running.splice(0)) {
    child.kill("SIGKILL");
    await rm(dir, { recursive: true, force: true });
  }
});

async function start(env: Record<string, string> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "omicron-server-"));
  await mkdir(join(dir, "build"));
  await writeFile(join(dir, "build/handler.js"), STUB_HANDLER);
  await writeFile(join(dir, "package.json"), '{"type":"module"}');
  await copyFile(join(app, "server.js"), join(dir, "server.js"));
  await symlink(join(app, "node_modules"), join(dir, "node_modules"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: dir,
    env: { ...process.env, PORT: "0", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  running.push({ child, dir });
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer) => chunk.toString().includes("Listening") && resolve());
    child.once("exit", (code) => reject(new Error(`server exited early with ${code}`)));
  });
  return { child, exited, port: await listeningPort(child.pid!) };
}

// PORT=0 lets the OS choose; read the chosen port back from /proc.
async function listeningPort(pid: number): Promise<number> {
  const { readFile, readdir, readlink } = await import("node:fs/promises");
  const inodes = new Set<string>();
  for (const fd of await readdir(`/proc/${pid}/fd`)) {
    const link = await readlink(`/proc/${pid}/fd/${fd}`).catch(() => "");
    const m = /^socket:\[(\d+)\]$/.exec(link);
    if (m) inodes.add(m[1]);
  }
  for (const table of ["/proc/net/tcp6", "/proc/net/tcp"]) {
    for (const line of (await readFile(table, "utf8")).split("\n").slice(1)) {
      const cols = line.trim().split(/\s+/);
      // State 0A is LISTEN.
      if (cols[3] === "0A" && inodes.has(cols[9])) return Number.parseInt(cols[1].split(":")[1], 16);
    }
  }
  throw new Error("no listening socket");
}

function get(port: number, path: string, agent?: http.Agent) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    http
      .get({ host: "127.0.0.1", port, path, agent }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode!, body }));
      })
      .on("error", reject);
  });
}

const timed = async <T>(work: Promise<T>) => {
  const started = performance.now();
  const value = await work;
  return { value, ms: performance.now() - started };
};

test.skipIf(process.platform !== "linux")("SIGTERM exits promptly and cleanly", async () => {
  const { child, exited } = await start();
  child.kill("SIGTERM");
  const { value: code, ms } = await timed(exited);
  expect(code).toBe(0);
  expect(ms).toBeLessThan(2000);
});

test.skipIf(process.platform !== "linux")("a request in flight at SIGTERM still gets its answer", async () => {
  const { child, exited, port } = await start();
  const response = get(port, "/slow");
  await new Promise((r) => setTimeout(r, 100));
  child.kill("SIGTERM");
  expect(await response).toEqual({ status: 200, body: "ok" });
  expect(await exited).toBe(0);
});

test.skipIf(process.platform !== "linux")("an idle keep-alive connection doesn't hold the shutdown open", async () => {
  const { child, exited, port } = await start();
  const agent = new http.Agent({ keepAlive: true });
  expect((await get(port, "/", agent)).status).toBe(200);
  child.kill("SIGTERM");
  const { value: code, ms } = await timed(exited);
  agent.destroy();
  expect(code).toBe(0);
  expect(ms).toBeLessThan(2000);
});

test.skipIf(process.platform !== "linux")(
  "a request that never finishes can't stall it past the deadline",
  async () => {
    const { child, exited, port } = await start({ SHUTDOWN_DEADLINE_MS: "500" });
    get(port, "/hang").catch(() => {});
    await new Promise((r) => setTimeout(r, 100));
    child.kill("SIGTERM");
    const { value: code, ms } = await timed(exited);
    expect(code).toBe(0);
    expect(ms).toBeGreaterThanOrEqual(400);
    expect(ms).toBeLessThan(3000);
  },
);
