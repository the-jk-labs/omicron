// SPDX-License-Identifier: AGPL-3.0-or-later
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { config } from "@/config.ts";
import { sql } from "@/db/client.ts";
import { READY_PREFIX, type InstanceReady, type InstanceState } from "./protocol.ts";

const backend = fileURLToPath(new URL("../../../", import.meta.url));
const secret = "signed-federation-test-secret-not-a-real-key";

export class Instances {
  private readonly databases: string[] = [];
  private readonly processes: ChildProcessWithoutNullStreams[] = [];
  private readonly active: Instance[] = [];
  private readonly directories: string[] = [];

  async start(): Promise<Instance> {
    // Generated names only: never migrate or drop an existing peer database.
    const name = `omicron_fed_${randomUUID().replaceAll("-", "")}`;
    await sql.unsafe(`create database "${name}"`);
    this.databases.push(name);
    const database = new URL(config.DATABASE_URL);
    database.pathname = `/${name}`;
    const directory = await mkdtemp(join(tmpdir(), "omicron-federation-"));
    this.directories.push(directory);
    const token = randomUUID();
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("VITEST")));
    const child = spawn(
      "pnpm",
      ["exec", "vitest", "run", "--config", "tests/integration/federation/instance.config.ts"],
      {
        cwd: backend,
        detached: process.platform !== "win32",
        env: {
          ...env,
          COREPACK_ENABLE_PROJECT_SPEC: "0",
          DOTENV_PATH: join(backend, "tests/test.env"),
          DATABASE_URL: database.href,
          SESSION_SECRET: secret,
          REDIS_URL: "",
          APP_DOMAIN: "localhost",
          FEDERATION_TEST_CONTROL: token,
          UPLOADS_DIR: join(directory, "uploads"),
          STATE_DIR: join(directory, "state"),
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    this.processes.push(child);
    const ready = Promise.withResolvers<InstanceReady>();
    let logs = "";
    let pending = "";
    const timeout = setTimeout(
      () => ready.reject(new Error(`Federation instance startup timed out.\n${logs}`)),
      30_000,
    );
    const collect = (chunk: Buffer) => {
      logs = (logs + chunk.toString()).slice(-12_000);
    };
    child.stderr.on("data", collect);
    child.stdout.on("data", (chunk: Buffer) => {
      collect(chunk);
      pending += chunk.toString();
      const lines = pending.split("\n");
      pending = lines.pop()!;
      for (const line of lines) {
        const index = line.indexOf(READY_PREFIX);
        if (index !== -1) ready.resolve(JSON.parse(line.slice(index + READY_PREFIX.length)) as InstanceReady);
      }
    });
    child.once("error", ready.reject);
    child.once("exit", (code) => ready.reject(new Error(`Federation instance exited with code ${code}.\n${logs}`)));
    try {
      const instance = new Instance(await ready.promise, token, child);
      this.active.push(instance);
      return instance;
    } finally {
      clearTimeout(timeout);
    }
  }

  async close() {
    await Promise.allSettled(this.active.map((instance) => instance.control("shutdown")));
    for (const child of this.processes) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      try {
        await once(child, "exit", { signal: AbortSignal.timeout(10_000) });
      } catch {
        if (child.pid) {
          if (process.platform === "win32") child.kill("SIGKILL");
          else process.kill(-child.pid, "SIGKILL");
          await once(child, "exit");
        }
      }
    }
    for (const name of this.databases) await sql.unsafe(`drop database "${name}"`);
    for (const directory of this.directories) await rm(directory, { recursive: true, force: true });
    await sql.end();
  }
}

export class Instance {
  readonly origin: string;
  readonly cookie: string;
  constructor(
    ready: InstanceReady,
    private readonly token: string,
    readonly child: ChildProcessWithoutNullStreams,
  ) {
    const url = new URL(ready.origin);
    if (url.hostname !== "localhost" || url.protocol !== "http:" || !url.port)
      throw new Error("Invalid test instance origin.");
    this.origin = url.origin;
    const session = `tok-${ready.userId}-${ready.sessionAt}`;
    const signature = createHmac("sha256", secret).update(session).digest("base64");
    this.cookie = `${ready.cookieName}=${encodeURIComponent(`${session}.${signature}`)}`;
  }

  request(path: string, init: RequestInit = {}, authenticated = true) {
    const headers = new Headers(init.headers);
    if (authenticated) headers.set("cookie", this.cookie);
    headers.set("origin", this.origin);
    headers.set("dnt", "1");
    return fetch(`${this.origin}${path}`, { ...init, headers, signal: AbortSignal.timeout(10_000) });
  }

  async control(action: string, body?: unknown) {
    const response = await this.request(
      `/__test__/${action}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json", "x-test-control": this.token },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      false,
    );
    if (!response.ok) throw new Error(`Test control ${action} returned ${response.status}.`);
    return response.json();
  }

  async state(): Promise<InstanceState> {
    return this.control("state");
  }
}
