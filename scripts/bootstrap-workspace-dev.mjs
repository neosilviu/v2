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
const skipMarketplaceSync = args.has("--skip-marketplace-sync") || process.env.V2_DEV_SKIP_MARKETPLACE_SYNC === "1";
const skipDemoSeed = args.has("--skip-demo-seed") || process.env.V2_DEV_SKIP_DEMO_SEED === "1";
const cookies = new Map();
const demoAccounts = [
  { key: "admin", name: "Development Admin", email: "admin@example.local", role: "admin", plan: "business", status: "active" },
  { key: "operator", name: "Development Operator", email: "operator@example.local", role: "operator", plan: "business", status: "active" },
  { key: "viewer", name: "Development Viewer", email: "viewer@example.local", role: "viewer", plan: "starter", status: "active" },
  { key: "invited", name: "Invited Customer", email: "invited@example.local", role: "viewer", plan: "starter", status: "invited" },
  { key: "disabled", name: "Disabled Account", email: "disabled@example.local", role: "viewer", plan: "starter", status: "disabled" },
];

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

function syncMarketplaceCatalog() {
  if (skipMarketplaceSync) return;
  run("Marketplace catalog sync", "pnpm", ["marketplace:sync"]);
}

function authSql(sql, json = false) {
  return run("auth local SQL", "pnpm", [
    "--dir",
    "apps/auth-worker",
    "exec",
    "wrangler",
    "d1",
    "execute",
    "v2-auth",
    "--local",
    ...(json ? ["--json"] : []),
    "--command",
    sql,
  ]);
}

function authUserIdByEmail(emailAddress) {
  const output = authSql(
    `SELECT id FROM user WHERE lower(email) = lower(${sqlString(emailAddress)}) LIMIT 1;`,
    true,
  );
  const parsed = JSON.parse(output);
  const firstResult = Array.isArray(parsed) ? parsed[0] : parsed;
  const rows = firstResult?.results ?? firstResult?.result ?? [];
  return Array.isArray(rows) && typeof rows[0]?.id === "string" ? rows[0].id : undefined;
}

function coreSql(sql) {
  return run("core local SQL", "pnpm", ["--dir", "apps/core-worker", "exec", "wrangler", "d1", "execute", "v2-core", "--local", "--command", sql]);
}

function resetLocalOwner() {
  authSql(`DELETE FROM user WHERE lower(email) = lower(${sqlString(email)});`);
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
    "Development Workspace",
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
    const activation = await request(authUrl, "/setup/owner/activate-existing", { method: "POST", body: JSON.stringify({ token }) });
    if (!activation.response.ok && activation.body?.error?.code !== "owner_setup_token_consumed") {
      throw new Error(`existing owner setup activation failed: HTTP ${activation.response.status} ${JSON.stringify(activation.body)}`);
    }
  }

  login = await signIn();
  if (!login.response.ok) throw new Error(`login validation failed: HTTP ${login.response.status} ${JSON.stringify(login.body)}`);
  const bootstrap = await request(coreUrl, `/workspaces/${encodeURIComponent(workspaceId)}/bootstrap`);
  if (!bootstrap.response.ok) throw new Error(`workspace bootstrap validation failed: HTTP ${bootstrap.response.status} ${JSON.stringify(bootstrap.body)}`);
}

async function ensureOpenDevelopmentRegistration() {
  const result = await request(coreUrl, `/workspaces/${encodeURIComponent(workspaceId)}/auth/policy`, {
    method: "PUT",
    body: JSON.stringify({ registrationMode: "open", requireEmailVerification: false, allowPasskeyRegistration: true, allowPasskeySignin: true }),
  });
  if (!result.response.ok) throw new Error(`development auth policy update failed: HTTP ${result.response.status} ${JSON.stringify(result.body)}`);
}

async function ensureDemoAuthAccounts() {
  const userIds = new Map();
  for (const account of demoAccounts.filter((item) => item.status === "active")) {
    cookies.clear();
    const signup = await request(authUrl, "/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ email: account.email, name: account.name, password }),
    });
    if (!signup.response.ok && signup.response.status !== 422 && signup.response.status !== 409) {
      throw new Error(`demo account signup failed for ${account.email}: HTTP ${signup.response.status} ${JSON.stringify(signup.body)}`);
    }
    const userId = signup.body?.user?.id ?? authUserIdByEmail(account.email);
    if (!userId) throw new Error(`could not resolve demo user id for ${account.email}`);
    userIds.set(account.key, userId);
  }
  const inactiveIds = new Map(demoAccounts.filter((item) => item.status !== "active").map((account) => [account.key, `development-${account.key}`]));
  return new Map([...userIds, ...inactiveIds]);
}

function seedDemoCoreData(userIds) {
  const plans = [
    { id: "starter", name: "Starter", status: "active", limits: { seats: 3, projects: 2, apiCallsPerMonth: 10000, support: "community" } },
    { id: "business", name: "Business", status: "active", limits: { seats: 25, projects: 50, apiCallsPerMonth: 500000, support: "priority", marketplaceInstalls: true } },
    { id: "enterprise", name: "Enterprise", status: "active", limits: { seats: 250, projects: "unlimited", apiCallsPerMonth: "unlimited", support: "dedicated", impersonation: true } },
    { id: "trial", name: "Trial Preview", status: "draft", limits: { seats: 1, projects: 1, trialDays: 14 } },
  ];
  const sql = [];
  for (const plan of plans) {
    sql.push(`INSERT INTO plans (id, name, status, limits_json, created_at, updated_at) VALUES (${sqlString(plan.id)}, ${sqlString(plan.name)}, ${sqlString(plan.status)}, ${sqlString(JSON.stringify(plan.limits))}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = excluded.status, limits_json = excluded.limits_json, updated_at = CURRENT_TIMESTAMP;`);
  }
  sql.push(`INSERT INTO user_plan_assignments (id, user_id, plan_id, status, starts_at, ends_at, created_at, updated_at) SELECT ${sqlString(`${workspaceId}:owner:enterprise`)}, user_id, 'enterprise', 'active', DATE('now'), NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM workspace_members WHERE workspace_id = ${sqlString(workspaceId)} AND lower(email) = lower(${sqlString(email)}) ON CONFLICT(id) DO UPDATE SET plan_id = excluded.plan_id, status = excluded.status, starts_at = excluded.starts_at, ends_at = excluded.ends_at, updated_at = CURRENT_TIMESTAMP;`);
  for (const account of demoAccounts) {
    const userId = userIds.get(account.key);
    if (!userId) continue;
    sql.push(`INSERT INTO workspace_members (workspace_id, user_id, email, status, updated_at) VALUES (${sqlString(workspaceId)}, ${sqlString(userId)}, ${sqlString(account.email)}, ${sqlString(account.status)}, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id, user_id) DO UPDATE SET email = excluded.email, status = excluded.status, updated_at = CURRENT_TIMESTAMP;`);
    sql.push(`DELETE FROM workspace_member_roles WHERE workspace_id = ${sqlString(workspaceId)} AND user_id = ${sqlString(userId)};`);
    sql.push(`INSERT OR IGNORE INTO workspace_member_roles (workspace_id, user_id, role_id) VALUES (${sqlString(workspaceId)}, ${sqlString(userId)}, ${sqlString(`${workspaceId}:${account.role}`)});`);
    sql.push(`INSERT INTO user_plan_assignments (id, user_id, plan_id, status, starts_at, ends_at, created_at, updated_at) VALUES (${sqlString(`${workspaceId}:${account.key}:${account.plan}`)}, ${sqlString(userId)}, ${sqlString(account.plan)}, ${sqlString(account.status === "invited" ? "scheduled" : account.status === "disabled" ? "disabled" : "active")}, DATE('now'), ${account.status === "disabled" ? "DATE('now')" : "NULL"}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, plan_id = excluded.plan_id, status = excluded.status, starts_at = excluded.starts_at, ends_at = excluded.ends_at, updated_at = CURRENT_TIMESTAMP;`);
  }
  const operatorId = userIds.get("operator");
  const viewerId = userIds.get("viewer");
  if (operatorId) sql.push(`INSERT INTO workspace_member_permission_overrides (workspace_id, user_id, permission, effect, created_at, updated_at) VALUES (${sqlString(workspaceId)}, ${sqlString(operatorId)}, 'plugin.activate', 'allow', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id, user_id, permission) DO UPDATE SET effect = excluded.effect, updated_at = CURRENT_TIMESTAMP;`);
  if (viewerId) sql.push(`INSERT INTO workspace_member_permission_overrides (workspace_id, user_id, permission, effect, created_at, updated_at) VALUES (${sqlString(workspaceId)}, ${sqlString(viewerId)}, 'publication.publish', 'deny', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(workspace_id, user_id, permission) DO UPDATE SET effect = excluded.effect, updated_at = CURRENT_TIMESTAMP;`);
  coreSql(sql.join("\n"));
}

async function seedDevelopmentDemo() {
  if (skipDemoSeed) return;
  await ensureOpenDevelopmentRegistration();
  const userIds = await ensureDemoAuthAccounts();
  await signIn();
  seedDemoCoreData(userIds);
}

async function main() {
  if (resetOwner) resetLocalOwner();
  applyLocalMigrations();
  syncMarketplaceCatalog();
  await waitFor("Core", coreUrl, "/health");
  await waitFor("Auth", authUrl, "/health");
  await ensureOwner();
  await seedDevelopmentDemo();
  console.log("Local development account ready");
  console.log(`Application: ${webUrl.replace(/\/$/, "")}/login`);
  console.log(`Workspace: ${workspaceId}`);
  console.log(`Owner: ${email} / ${password}`);
  console.log(`Demo sign-in: admin@example.local / ${password}`);
  console.log(`Demo sign-in: operator@example.local / ${password}`);
  console.log(`Demo sign-in: viewer@example.local / ${password}`);
  console.log("Seeded: owner, admin, operator, viewer, invited, disabled; roles, permission overrides, plans and assignments.");
  console.log("Local-only credentials and development fixtures");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
