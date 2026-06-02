#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const coreUrl = process.env.V2_CORE_URL ?? "http://localhost:8787";
const authUrl = process.env.V2_AUTH_URL ?? "http://localhost:8788";
const webUrl = process.env.V2_WEB_URL ?? "http://localhost:5173";
const workspaceId = process.env.V2_PERF_WORKSPACE_ID ?? `perf-${Date.now()}`;
const email = process.env.V2_PERF_EMAIL ?? `perf-${Date.now()}@example.local`;
const password = process.env.V2_PERF_PASSWORD ?? "LocalDevPassword123!";
const warmP95BudgetMs = Number(process.env.V2_PERF_P95_BUDGET_MS ?? "30");
const cookies = new Map();

function run(name, command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0)
    throw new Error(`${name} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function applyLocalMigrations() {
  for (const [directory, database] of [
    ["apps/auth-worker", "v2-auth"],
    ["apps/core-worker", "v2-core"],
    ["plugins/website-studio", "v2-website-studio"],
  ]) {
    run(`migrations ${database}`, "pnpm", [
      "--dir",
      directory,
      "exec",
      "wrangler",
      "d1",
      "migrations",
      "apply",
      database,
      "--local",
    ]);
  }
}

function mergeCookies(headers) {
  const setCookies =
    typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : headers.get("set-cookie")
        ? headers.get("set-cookie").split(/,(?=\s*[^;,]+=)/g)
        : [];
  for (const header of setCookies) {
    const [pair] = header.split(";");
    const index = pair.indexOf("=");
    if (index > 0)
      cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

function cookieHeader() {
  return [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function request(base, path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("origin")) headers.set("origin", webUrl);
  headers.set("x-v2-server-timing", "1");
  if (cookies.size && !init.omitCookies) headers.set("cookie", cookieHeader());
  if (init.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  const started = performance.now();
  const response = await fetch(new URL(path, base), { ...init, headers });
  const ms = performance.now() - started;
  mergeCookies(response.headers);
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return {
    response,
    body,
    ms,
    serverTiming: response.headers.get("server-timing") ?? "",
  };
}

function provisionWorkspace() {
  const output = run("workspace provisioning", "node", [
    "scripts/provision-workspace.mjs",
    "--local",
    "--break-glass-print-token",
    "--workspace",
    workspaceId,
    "--name",
    "Perf Workspace",
    "--owner",
    email,
    "--ttl-hours",
    "2",
  ]);
  const match = output.match(
    /Break-glass one-time setup URL: \/setup\/owner\?token=([^\s]+)/,
  );
  if (!match?.[1])
    throw new Error(`setup token missing from provisioning output: ${output}`);
  return decodeURIComponent(match[1]);
}

async function prepareSession() {
  applyLocalMigrations();
  const token = provisionWorkspace();
  const signup = await request(authUrl, "/setup/owner/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ token, email, name: "Perf Owner", password }),
  });
  if (!signup.response.ok) {
    if (signup.response.status !== 409)
      throw new Error(`owner sign-up failed: HTTP ${signup.response.status}`);
    const login = await request(authUrl, "/api/auth/sign-in/email", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!login.response.ok)
      throw new Error(
        `owner sign-in failed after setup fallback: HTTP ${login.response.status}`,
      );
    const session = await request(coreUrl, "/session");
    const user = session.body?.user ?? login.body?.user ?? null;
    const consume = await request(coreUrl, "/setup/owner/consume", {
      method: "POST",
      body: JSON.stringify({ token, user }),
    });
    if (
      !consume.response.ok &&
      consume.body?.error?.code !== "owner_setup_token_consumed"
    ) {
      throw new Error(
        `owner setup consume failed after setup fallback: HTTP ${consume.response.status} ${JSON.stringify(consume.body)}`,
      );
    }
  }
  const bootstrap = await request(
    coreUrl,
    `/workspaces/${encodeURIComponent(workspaceId)}/bootstrap`,
  );
  if (!bootstrap.response.ok)
    throw new Error(`bootstrap failed: HTTP ${bootstrap.response.status}`);
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[
      Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
    ] ?? 0
  );
}

async function measure(name, base, path, options = {}, iterations = 40) {
  for (let index = 0; index < 5; index += 1) await request(base, path, options);
  const samples = [];
  let lastServerTiming = "";
  for (let index = 0; index < iterations; index += 1) {
    const result = await request(base, path, options);
    if (!result.response.ok)
      throw new Error(
        `${name} failed during measurement: HTTP ${result.response.status}`,
      );
    samples.push(result.ms);
    lastServerTiming = result.serverTiming || lastServerTiming;
  }
  return {
    name,
    min: Math.min(...samples),
    median: percentile(samples, 50),
    p95: percentile(samples, 95),
    max: Math.max(...samples),
    serverTiming: lastServerTiming,
  };
}

async function main() {
  await prepareSession();
  const endpoints = [
    [
      "app startup bootstrap",
      coreUrl,
      `/bootstrap?workspaceId=${encodeURIComponent(workspaceId)}`,
      { omitCookies: true },
    ],
    ["session helper", coreUrl, "/session"],
    [
      "workspace bootstrap",
      coreUrl,
      `/workspaces/${encodeURIComponent(workspaceId)}/bootstrap`,
    ],
    [
      "settings tabs",
      coreUrl,
      `/workspaces/${encodeURIComponent(workspaceId)}/settings/tabs`,
    ],
    [
      "general settings tab",
      coreUrl,
      `/workspaces/${encodeURIComponent(workspaceId)}/settings/tabs/platform.settings.general`,
    ],
  ];
  const results = [];
  for (const endpoint of endpoints) results.push(await measure(...endpoint));
  console.log(
    `Local warm performance for ${workspaceId}; enforced p95 budget <= ${warmP95BudgetMs.toFixed(1)}ms`,
  );
  for (const item of results) {
    console.log(
      `${item.name}: min=${item.min.toFixed(1)}ms median=${item.median.toFixed(1)}ms p95=${item.p95.toFixed(1)}ms max=${item.max.toFixed(1)}ms`,
    );
    console.log(
      `${item.name} server-timing: ${item.serverTiming || "missing"}`,
    );
  }
  const slow = results.filter(
    (item) =>
      item.name === "app startup bootstrap" && item.p95 > warmP95BudgetMs,
  );
  if (slow.length) {
    console.error(
      `Warm p95 exceeded ${warmP95BudgetMs.toFixed(1)}ms for: ${slow.map((item) => item.name).join(", ")}`,
    );
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
