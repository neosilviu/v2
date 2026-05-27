#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const authUrl = process.env.V2_AUTH_URL ?? "http://localhost:8788";
const coreUrl = process.env.V2_CORE_URL ?? "http://localhost:8787";
const webUrl = process.env.V2_WEB_URL ?? "http://localhost:5173";
const workspaceId = process.env.V2_DEV_WORKSPACE_ID ?? "default";
const email = process.env.V2_DEV_OWNER_EMAIL ?? "owner@example.local";
const password = process.env.V2_DEV_OWNER_PASSWORD ?? "LocalDevPassword123!";
const resetOwner = args.has("--reset-local-owner");
const cookies = new Map();

function run(name, command, commandArgs) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error(`${name} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function applyLocalMigrations() {
  for (const [directory, database] of [["apps/auth-worker", "v2-auth"], ["apps/core-worker", "v2-core"], ["plugins/website-studio", "v2-website-studio"]]) {
    run(`migrations ${database}`, "pnpm", ["--dir", directory, "exec", "wrangler", "d1", "migrations", "apply", database, "--local"]);
  }
}

function authSql(sql) {
  return run("auth local SQL", "pnpm", ["--dir", "apps/auth-worker", "exec", "wrangler", "d1", "execute", "v2-auth", "--local", "--command", sql]);
}

function resetLocalOwner() {
  authSql(`DELETE FROM user WHERE lower(email) = lower(${sqlString(email)});`);
}

function mergeCookies(headers) {
  const setCookies = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : (headers.get("set-cookie") ? headers.get("set-cookie").split(/,(?=\\s*[^;,]+=)/g) : []);
  for (const header of setCookies) {
    const [pair] = header.split(";");
    const index = pair.indexOf("=");
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

function cookieHeader() {
  return [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function request(base, path, init = {}) {
  const headers = new Headers(init.headers ?? {});
  if (!headers.has("origin")) headers.set("origin", webUrl);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (cookies.size) headers.set("cookie", cookieHeader());
  const response = await fetch(new URL(path, base), { ...init, headers, credentials: "include" });
  mergeCookies(response.headers);
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { response, body };
}

async function waitFor(name, base, path) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(new URL(path, base));
      if (response.ok) return;
    } catch {
      // Wrangler dev can still be starting while local setup is invoked.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} is not reachable at ${base}${path}. Start pnpm dev before pnpm dev:setup.`);
}

function provisionWorkspace() {
  const output = run("workspace provisioning", "node", [
    "scripts/provision-workspace.mjs",
    "--local",
    "--break-glass-print-token",
    "--workspace",
    workspaceId,
    "--name",
    "Default Workspace",
    "--owner",
    email,
    "--ttl-hours",
    "24",
  ]);
  const match = output.match(/Break-glass one-time setup URL: \/setup\/owner\?token=([^\s]+)/);
  if (!match?.[1]) throw new Error(`workspace provisioning did not print a setup token\n${output}`);
  return decodeURIComponent(match[1]);
}

async function signIn() {
  cookies.clear();
  return request(authUrl, "/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

async function ensureOwner() {
  let login = await signIn();
  if (login.response.ok) {
    const bootstrap = await request(coreUrl, `/workspaces/${encodeURIComponent(workspaceId)}/bootstrap`);
    if (bootstrap.response.ok) return;
  } else if (resetOwner) {
    resetLocalOwner();
  }

  const token = provisionWorkspace();
  cookies.clear();
  const signup = await request(authUrl, "/setup/owner/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ token, email, name: "Local Dev Owner", password }),
  });
  if (!signup.response.ok && signup.body?.error?.code !== "owner_account_already_exists") {
    throw new Error(`owner setup signup failed: HTTP ${signup.response.status} ${JSON.stringify(signup.body)}`);
  }

  if (!signup.response.ok) {
    login = await signIn();
    if (!login.response.ok) throw new Error(`owner account exists but local password cannot sign in: HTTP ${login.response.status} ${JSON.stringify(login.body)}`);
    const consume = await request(coreUrl, "/setup/owner/consume", { method: "POST", body: JSON.stringify({ token }) });
    if (!consume.response.ok && consume.body?.error?.code !== "owner_setup_token_consumed") {
      throw new Error(`existing owner setup consume failed: HTTP ${consume.response.status} ${JSON.stringify(consume.body)}`);
    }
  }

  login = await signIn();
  if (!login.response.ok) throw new Error(`login validation failed: HTTP ${login.response.status} ${JSON.stringify(login.body)}`);
  const bootstrap = await request(coreUrl, `/workspaces/${encodeURIComponent(workspaceId)}/bootstrap`);
  if (!bootstrap.response.ok) throw new Error(`workspace bootstrap validation failed: HTTP ${bootstrap.response.status} ${JSON.stringify(bootstrap.body)}`);
}

async function main() {
  if (resetOwner) resetLocalOwner();
  applyLocalMigrations();
  await waitFor("Core", coreUrl, "/health");
  await waitFor("Auth", authUrl, "/health");
  await ensureOwner();
  console.log("Local development account ready");
  console.log(`Application: ${webUrl.replace(/\/$/, "")}/login`);
  console.log(`Workspace: ${workspaceId}`);
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);
  console.log("Local-only credentials");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
