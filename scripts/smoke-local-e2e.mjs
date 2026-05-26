#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = new Set(process.argv.slice(2));
const authUrl = process.env.V2_AUTH_URL ?? "http://localhost:8788";
const coreUrl = process.env.V2_CORE_URL ?? "http://localhost:8787";
const webUrl = process.env.V2_WEB_URL ?? "http://localhost:5173";
const workspaceId = process.env.V2_WORKSPACE_ID ?? `smoke-${Date.now()}`;
const email = process.env.V2_SMOKE_EMAIL ?? "owner@example.local";
const password = process.env.V2_SMOKE_PASSWORD ?? "LocalDevPassword123!";
const prepareAuthDb = args.has("--prepare-auth-db") || process.env.V2_SMOKE_PREPARE_AUTH === "1";
const installPlugins = !args.has("--skip-plugin-install");

const cookies = new Map();
const results = [];

function record(name, status, detail = "") {
  results.push({ name, status, detail });
  const icon = status === "ok" ? "ok" : status === "skip" ? "skip" : "fail";
  console.log(`[${icon}] ${name}${detail ? ` - ${detail}` : ""}`);
}

function mergeCookies(headers) {
  const setCookies = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : (headers.get("set-cookie") ? headers.get("set-cookie").split(/,(?=\s*[^;,]+=)/g) : []);
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
  if (!headers.has("content-type") && init.body && !(init.body instanceof FormData)) headers.set("content-type", "application/json");
  if (cookies.size > 0) headers.set("cookie", cookieHeader());
  const response = await fetch(new URL(path, base), { ...init, headers });
  mergeCookies(response.headers);
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  return { response, body };
}

async function expectOk(name, promise, accept = (status) => status >= 200 && status < 300) {
  try {
    const result = await promise;
    if (!accept(result.response.status)) throw new Error(`HTTP ${result.response.status}: ${JSON.stringify(result.body).slice(0, 240)}`);
    record(name, "ok");
    return result;
  } catch (error) {
    record(name, "fail", error instanceof Error ? error.message : String(error));
    throw error;
  }
}
async function waitForService(name, base, path) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(new URL(path, base));
      if (response.ok) return;
    } catch {
      // local wrangler can briefly restart while migrations/catalog seed run
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${name} did not become ready after local setup`);
}

function prepareAuthPolicyOpen() {
  const sql = `INSERT INTO auth_policies (id, workspace_id, registration_mode, require_email_verification, allow_passkey_registration, allow_passkey_signin, created_at, updated_at)
VALUES ('global', NULL, 'open', 0, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET registration_mode = 'open', require_email_verification = 0, allow_passkey_registration = 1, allow_passkey_signin = 1, updated_at = CURRENT_TIMESTAMP;`;
  const result = spawnSync("pnpm", ["--dir", "apps/auth-worker", "exec", "wrangler", "d1", "execute", "v2-auth", "--local", "--command", sql], { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "wrangler d1 execute failed").trim());
  }
  record("local Auth D1 registration policy opened", "ok", "local only");
}

function publishPasskeyLocalOnly() {
  const sql = `INSERT INTO auth_methods (id, workspace_id, type, provider_id, title, status, public_visible, display_order, configuration_ref, created_at, updated_at)
VALUES ('passkey', NULL, 'passkey', NULL, 'Passkey', 'enabled', 1, 30, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET status = 'enabled', public_visible = 1, display_order = 30, updated_at = CURRENT_TIMESTAMP;`;
  const result = spawnSync("pnpm", ["--dir", "apps/auth-worker", "exec", "wrangler", "d1", "execute", "v2-auth", "--local", "--command", sql], { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "wrangler d1 execute failed").trim());
  record("local Auth D1 passkey method published", "ok", "local only");
}

function coreSqlLocal(sql) {
  const result = spawnSync("pnpm", ["--dir", "apps/core-worker", "exec", "wrangler", "d1", "execute", "v2-core", "--local", "--command", sql], { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "wrangler d1 execute failed").trim());
  return result.stdout;
}
function authSqlLocal(sql) {
  const result = spawnSync("pnpm", ["--dir", "apps/auth-worker", "exec", "wrangler", "d1", "execute", "v2-auth", "--local", "--command", sql], { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "wrangler d1 execute failed").trim());
  return result.stdout;
}
function applyLocalMigrations() {
  for (const [directory, database] of [["apps/auth-worker", "v2-auth"], ["apps/core-worker", "v2-core"], ["plugins/website-studio", "v2-website-studio"]]) {
    const result = spawnSync("pnpm", ["--dir", directory, "exec", "wrangler", "d1", "migrations", "apply", database, "--local"], { encoding: "utf8", stdio: "pipe" });
    if (result.status !== 0) throw new Error((result.stderr || result.stdout || `local migrations failed for ${database}`).trim());
  }
  record("Local D1 migrations applied", "ok");
}
function syncLocalMarketplace() {
  const result = spawnSync("pnpm", ["marketplace:sync"], { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "marketplace sync failed").trim());
  record("Local Marketplace catalog synced", "ok");
}

function provisionWorkspaceLocal(targetWorkspaceId = workspaceId, owner = email) {
  const result = spawnSync("node", ["scripts/provision-workspace.mjs", "--local", "--break-glass-print-token", "--workspace", targetWorkspaceId, "--name", "Local Smoke Workspace", "--owner", owner, "--ttl-hours", "2"], { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || "workspace provisioning failed").trim());
  const match = result.stdout.match(/Break-glass one-time setup URL: \/setup\/owner\?token=([^\s]+)/);
  if (!match?.[1]) throw new Error(`provisioning output did not include a setup token: ${result.stdout}`);
  record("Workspace provisioning request created", "ok", "local only");
  return decodeURIComponent(match[1]);
}

function assertNoOwnerLocal() {
  const output = coreSqlLocal(`SELECT COUNT(*) AS count FROM workspace_member_roles WHERE workspace_id = '${workspaceId.replaceAll("'", "''")}' AND role_id = '${`${workspaceId}:owner`.replaceAll("'", "''")}';`);
  if (!/"count":\s*0/.test(output)) throw new Error(`workspace owner was created implicitly: ${output}`);
  record("No implicit workspace Owner was created", "ok");
}

async function ensureSignedIn() {
  const signup = await request(authUrl, "/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name: "Local Smoke Owner" }),
  });
  if (signup.response.status >= 200 && signup.response.status < 300) {
    record("Better Auth email sign-up", "ok", email);
    return;
  }
  const signin = await request(authUrl, "/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (signin.response.status >= 200 && signin.response.status < 300) {
    record("Better Auth email sign-in", "ok", email);
    return;
  }
  throw new Error(`sign-up failed with ${signup.response.status} ${JSON.stringify(signup.body).slice(0, 180)}; sign-in failed with ${signin.response.status} ${JSON.stringify(signin.body).slice(0, 180)}`);
}

async function exerciseAuthPublication() {
  const summary = await request(coreUrl, `/workspaces/${encodeURIComponent(workspaceId)}/auth/security-summary`);
  if (summary.response.status === 403) {
    if (!prepareAuthDb) {
      record("Auth admin publication smoke", "skip", "owner RBAC is required to run this part");
      return;
    }
    record("Auth admin publication smoke", "skip", "using local D1 publication fallback");
    publishPasskeyLocalOnly();
    const first = await expectOk("Public login config after local passkey publish", request(authUrl, `/public/auth/login-config?workspaceId=${encodeURIComponent(workspaceId)}`));
    const second = await expectOk("Public login config second read", request(authUrl, `/public/auth/login-config?workspaceId=${encodeURIComponent(workspaceId)}`));
    const firstHasPasskey = first.body?.methods?.some?.((method) => method.type === "passkey");
    const secondHasPasskey = second.body?.methods?.some?.((method) => method.type === "passkey");
    if (!firstHasPasskey || !secondHasPasskey) throw new Error("passkey publication did not persist across login-config reads");
    record("Passkey remains published across login config reads", "ok");
    return;
  }
  if (!summary.response.ok) throw new Error(`Auth admin summary failed: ${summary.response.status}`);
  record("Auth admin security summary", "ok");
  await expectOk("Auth registration/passkey policy update", request(coreUrl, `/workspaces/${encodeURIComponent(workspaceId)}/auth/policy`, {
    method: "PUT",
    body: JSON.stringify({ registrationMode: "open", requireEmailVerification: false, allowPasskeyRegistration: true, allowPasskeySignin: true }),
  }));
  await expectOk("Auth passkey method publication", request(coreUrl, `/workspaces/${encodeURIComponent(workspaceId)}/auth/methods/passkey`, {
    method: "PUT",
    body: JSON.stringify({ type: "passkey", providerId: null, title: "Passkey", status: "enabled", publicVisible: true, displayOrder: 30 }),
  }));
  const first = await expectOk("Public login config after passkey publish", request(authUrl, `/public/auth/login-config?workspaceId=${encodeURIComponent(workspaceId)}`));
  const second = await expectOk("Public login config second read", request(authUrl, `/public/auth/login-config?workspaceId=${encodeURIComponent(workspaceId)}`));
  const firstHasPasskey = first.body?.methods?.some?.((method) => method.type === "passkey");
  const secondHasPasskey = second.body?.methods?.some?.((method) => method.type === "passkey");
  if (!firstHasPasskey || !secondHasPasskey) throw new Error("passkey publication did not persist across login-config reads");
  record("Passkey remains published across login config reads", "ok");
}

async function exerciseMarketplace() {
  const catalog = await expectOk("Marketplace catalog with workspace state", request(coreUrl, `/marketplace/plugins?workspaceId=${encodeURIComponent(workspaceId)}`));
  const plugins = catalog.body?.plugins ?? [];
  if (!Array.isArray(plugins) || plugins.length === 0) {
    record("Marketplace plugin install smoke", "skip", "run pnpm marketplace:sync first");
    return;
  }
  for (const item of plugins) {
    const pluginId = item.manifest?.id;
    if (!pluginId) continue;
    await expectOk(`Core session before ${pluginId} install`, request(coreUrl, "/session"));
    let install = await request(coreUrl, `/marketplace/plugins/${encodeURIComponent(pluginId)}/install?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "POST", body: JSON.stringify({}) });
    if (install.response.status === 202 && install.body?.approvalId) {
      record(`Plugin ${pluginId} install requested approval`, "ok", install.body.approvalId);
      await expectOk(`Plugin ${pluginId} approval decision`, request(coreUrl, `/approval-requests/${encodeURIComponent(install.body.approvalId)}/decision`, {
        method: "POST",
        body: JSON.stringify({ workspaceId, decision: "approved", reason: "local smoke test" }),
      }));
      install = await request(coreUrl, `/marketplace/plugins/${encodeURIComponent(pluginId)}/install?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "POST",
        body: JSON.stringify({ approvalId: install.body.approvalId }),
      });
    }
    if (install.response.status >= 200 && install.response.status < 300) record(`Plugin ${pluginId} installed/active`, "ok");
    else throw new Error(`Plugin ${pluginId} install failed: ${install.response.status} ${JSON.stringify(install.body).slice(0, 240)}`);
    await expectOk(`Plugin ${pluginId} deactivate`, request(coreUrl, "/plugins/deactivate", { method: "POST", body: JSON.stringify({ workspaceId, pluginId }) }));
    await expectOk(`Plugin ${pluginId} reactivate`, request(coreUrl, "/plugins/activate", { method: "POST", body: JSON.stringify({ workspaceId, pluginId }) }));
    if (pluginId === "website-studio") await exerciseWebsiteStudioRuntime();
  }
}

async function exerciseWebsiteStudioRuntime() {
  const runtimeOutput = coreSqlLocal(`SELECT runtime_status, runtime_kind FROM plugin_runtime_deployments WHERE workspace_id = '${workspaceId.replaceAll("'", "''")}' AND plugin_id = 'website-studio' LIMIT 1;`);
  if (!/"runtime_status":\s*"active"/.test(runtimeOutput) || !/"runtime_kind":\s*"local-dev"/.test(runtimeOutput)) throw new Error(`website-studio runtime was not provisioned by the local adapter: ${runtimeOutput}`);
  record("Website Studio local runtime deployment confirmed", "ok");
  await expectOk("Website Studio capability grants separated from RBAC", request(coreUrl, "/plugins/grants", {
    method: "POST",
    body: JSON.stringify({ workspaceId, pluginId: "website-studio", capabilities: ["website.pages.read", "website.pages.write", "website.publish", "website.context.share"] }),
  }));
  const defaults = await expectOk("Website Studio defaults through generic runtime dispatch", request(coreUrl, "/tools/execute", {
    method: "POST",
    body: JSON.stringify({ workspaceId, toolId: "website.installDefaults" }),
  }));
  const pageId = defaults.body?.result?.page?.id;
  if (!pageId) throw new Error(`Website defaults did not return a page id: ${JSON.stringify(defaults.body).slice(0, 240)}`);
  await expectOk("Website Studio list through generic runtime dispatch", request(coreUrl, "/tools/execute", {
    method: "POST",
    body: JSON.stringify({ workspaceId, toolId: "website.listPages" }),
  }));
  const publish = await request(coreUrl, "/tools/execute", {
    method: "POST",
    body: JSON.stringify({ workspaceId, toolId: "website.publishPage", input: { pageId } }),
  });
  if (publish.response.status !== 202 || !publish.body?.approvalId) throw new Error(`Website publish should require approval, got ${publish.response.status} ${JSON.stringify(publish.body).slice(0, 240)}`);
  record("Website publish requires approval", "ok", publish.body.approvalId);
  await expectOk("Website publish approval decision", request(coreUrl, "/tool-approvals/decision", {
    method: "POST",
    body: JSON.stringify({ workspaceId, approvalId: publish.body.approvalId, decision: "approved" }),
  }));
  await expectOk("Website publish executes after approval", request(coreUrl, "/tools/execute", {
    method: "POST",
    body: JSON.stringify({ workspaceId, toolId: "website.publishPage", input: { pageId }, approvalId: publish.body.approvalId }),
  }));
  const replay = await request(coreUrl, "/tools/execute", {
    method: "POST",
    body: JSON.stringify({ workspaceId, toolId: "website.publishPage", input: { pageId }, approvalId: publish.body.approvalId }),
  });
  if (replay.response.status !== 403) throw new Error(`Website publish approval replay should be 403, got ${replay.response.status}`);
  record("Website publish approval replay denied", "ok");
  await expectOk("Website public contribution published by Core", request(coreUrl, "/publications", {
    method: "POST",
    body: JSON.stringify({ workspaceId, pluginId: "website-studio", contributionKind: "route", contributionId: "website-studio.public.home", publicPath: "/" }),
  }));
  await expectOk("Website public route resolves", request(coreUrl, `/public/${encodeURIComponent(workspaceId)}/`));
  const publicData = await expectOk("Website public page data dispatches to runtime", request(coreUrl, `/public/${encodeURIComponent(workspaceId)}/runtime/data`, {
    method: "POST",
    body: JSON.stringify({ contributionId: "website-studio.public.home", dataSourceId: "website-studio.public.page.read", routeParams: {} }),
  }));
  if (publicData.body?.status !== "ok" || !publicData.body?.data?.page?.id) throw new Error(`public Website data did not return a page: ${JSON.stringify(publicData.body).slice(0, 240)}`);
  const forbiddenPublicAction = await request(coreUrl, `/public/${encodeURIComponent(workspaceId)}/runtime/actions`, {
    method: "POST",
    body: JSON.stringify({ contributionId: "website-studio.public.home", actionId: "website.updateSection", input: { pageId } }),
  });
  if (forbiddenPublicAction.response.status !== 403) throw new Error(`public write action should be denied, got ${forbiddenPublicAction.response.status}`);
  record("Website public write action denied by policy", "ok");
}

async function exerciseOwnerSetupSignupWithRegistrationDisabled() {
  const targetWorkspace = `${workspaceId}-new-owner`;
  const ownerEmail = `new-${Date.now()}@example.local`;
  const ownerPassword = "LocalDevPassword456!";
  authSqlLocal(`INSERT INTO auth_policies (id, workspace_id, registration_mode, require_email_verification, allow_passkey_registration, allow_passkey_signin, created_at, updated_at)
VALUES ('global', NULL, 'disabled', 0, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET registration_mode = 'disabled', updated_at = CURRENT_TIMESTAMP;`);
  cookies.clear();
  const token = provisionWorkspaceLocal(targetWorkspace, ownerEmail);
  await expectOk("Owner setup API creates account with registration disabled", request(authUrl, "/setup/owner/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ token, email: ownerEmail, name: "New Smoke Owner", password: ownerPassword }),
  }));
  await expectOk("New owner session reaches Core", request(coreUrl, "/session"));
  const replay = await request(coreUrl, "/setup/owner/consume", { method: "POST", body: JSON.stringify({ token }) });
  if (replay.response.status !== 409) throw new Error(`owner setup replay should be 409, got ${replay.response.status}`);
  record("Owner setup token replay denied", "ok");
  cookies.clear();
  if (prepareAuthDb) prepareAuthPolicyOpen();
}

async function main() {
  console.log(`Local e2e smoke: auth=${authUrl} core=${coreUrl} web=${webUrl} workspace=${workspaceId}`);
  await expectOk("Web /login route", fetch(new URL("/login", webUrl)).then(async (response) => ({ response, body: await response.text() })));
  await expectOk("Core health", request(coreUrl, "/health"));
  applyLocalMigrations();
  await expectOk("Auth public login config", request(authUrl, `/public/auth/login-config?workspaceId=${encodeURIComponent(workspaceId)}`));
  if (installPlugins) syncLocalMarketplace();
  await waitForService("Core", coreUrl, "/health");
  await waitForService("Auth", authUrl, "/health");
  const anonymousSettings = await request(coreUrl, `/workspaces/${encodeURIComponent(workspaceId)}/settings/tabs`);
  if (anonymousSettings.response.status !== 401) throw new Error(`anonymous settings tabs should be 401, got ${anonymousSettings.response.status}`);
  record("Anonymous Settings is private-by-default", "ok");
  if (prepareAuthDb) prepareAuthPolicyOpen();
  await ensureSignedIn();
  await expectOk("Core session with Better Auth cookie", request(coreUrl, "/session"));
  const unprovisionedSettings = await request(coreUrl, `/workspaces/${encodeURIComponent(workspaceId)}/settings/tabs`);
  if (unprovisionedSettings.response.status !== 403) throw new Error(`unprovisioned user settings should be 403, got ${unprovisionedSettings.response.status}`);
  record("Normal signed-in user cannot administer unprovisioned workspace", "ok");
  assertNoOwnerLocal();
  const setupToken = provisionWorkspaceLocal();
  await expectOk("Owner setup consumed explicitly", request(coreUrl, "/setup/owner/consume", { method: "POST", body: JSON.stringify({ token: setupToken }) }));
  await exerciseOwnerSetupSignupWithRegistrationDisabled();
  await ensureSignedIn();
  await expectOk("Runtime Settings tabs with session", request(coreUrl, `/workspaces/${encodeURIComponent(workspaceId)}/settings/tabs`));
  await exerciseAuthPublication();
  if (installPlugins) await exerciseMarketplace();
  const failed = results.filter((item) => item.status === "fail");
  if (failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
