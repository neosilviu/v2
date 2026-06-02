#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { applyLocalSqliteMigrations, executeLocalSqlite } from "./local-d1.mjs";
import { ensureLocalDevStack } from "./local-dev-stack.mjs";

const coreUrl = process.env.V2_CORE_URL ?? "http://localhost:8787";
const authUrl = process.env.V2_AUTH_URL ?? "http://localhost:8788";
const webUrl = process.env.V2_WEB_URL ?? "http://localhost:5173";
const workspaceId =
  process.env.V2_LOADTEST_WORKSPACE_ID ??
  process.env.V2_DEV_WORKSPACE_ID ??
  "default";
const ownerEmail =
  process.env.V2_LOADTEST_OWNER_EMAIL ??
  process.env.V2_DEV_OWNER_EMAIL ??
  "owner@example.local";
const ownerPassword =
  process.env.V2_LOADTEST_OWNER_PASSWORD ??
  process.env.V2_DEV_OWNER_PASSWORD ??
  "LocalDevPassword123!";
const cohortSizes = parseNumberList(
  process.env.V2_LOADTEST_COUNTS ?? "10,20,50,100",
);
const workspaceQuery = `workspace=${encodeURIComponent(workspaceId)}`;

function parseNumberList(value) {
  return [...new Set(
    value
      .split(/[\s,]+/g)
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isFinite(item) && item > 0),
  )].sort((left, right) => left - right);
}

function run(name, command, args, env = process.env) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "pipe",
    env,
  });
  if (result.status !== 0) {
    throw new Error(
      `${name} failed\n${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim(),
    );
  }
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

function seedWorkspaceBootstrap() {
  applyLocalMigrations();
  run("workspace bootstrap", "node", [
    "scripts/bootstrap-workspace-dev.mjs",
  ], {
    ...process.env,
    V2_DEV_WORKSPACE_ID: workspaceId,
    V2_DEV_OWNER_EMAIL: ownerEmail,
    V2_DEV_OWNER_PASSWORD: ownerPassword,
  });
}

function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function authUserIdByEmail(email) {
  const output = executeLocalSqlite(
    "apps/auth-worker",
    `SELECT id FROM user WHERE lower(email) = lower(${sqlString(email)}) LIMIT 1;`,
  );
  const rows = output ? JSON.parse(output) : [];
  return Array.isArray(rows) && typeof rows[0]?.id === "string"
    ? rows[0].id
    : null;
}

function upsertWorkspaceMember(userId, email, roleId, status = "active") {
  executeLocalSqlite(
    "apps/core-worker",
    [
      `INSERT INTO workspace_members (workspace_id, user_id, email, status, updated_at)`,
      `VALUES (${sqlString(workspaceId)}, ${sqlString(userId)}, ${sqlString(email)}, ${sqlString(status)}, CURRENT_TIMESTAMP)`,
      "ON CONFLICT(workspace_id, user_id) DO UPDATE SET",
      "email = excluded.email,",
      "status = excluded.status,",
      "updated_at = CURRENT_TIMESTAMP;",
      `DELETE FROM workspace_member_roles WHERE workspace_id = ${sqlString(workspaceId)} AND user_id = ${sqlString(userId)};`,
      `INSERT OR IGNORE INTO workspace_member_roles (workspace_id, user_id, role_id) VALUES (${sqlString(workspaceId)}, ${sqlString(userId)}, ${sqlString(roleId)});`,
    ].join(" "),
  );
}

function mergeCookies(cookieJar, headers) {
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
      cookieJar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

function cookieHeader(cookieJar) {
  return [...cookieJar].map(([key, value]) => `${key}=${value}`).join("; ");
}

function createClient(name) {
  const cookies = new Map();
  return {
    name,
    cookies,
    async request(base, path, init = {}) {
      const headers = new Headers(init.headers ?? {});
      if (!headers.has("origin")) headers.set("origin", webUrl);
      if (!headers.has("accept")) headers.set("accept", "application/json, text/plain, */*");
      if (
        init.body &&
        !(init.body instanceof FormData) &&
        !headers.has("content-type")
      )
        headers.set("content-type", "application/json");
      if (cookies.size) headers.set("cookie", cookieHeader(cookies));
      headers.set("x-v2-server-timing", "1");
      const started = performance.now();
      const response = await fetch(new URL(path, base), {
        ...init,
        headers,
        credentials: "include",
      });
      const ms = performance.now() - started;
      mergeCookies(cookies, response.headers);
      const text = await response.text();
      let body = text;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }
      return {
        name,
        path,
        response,
        body,
        ms,
        serverTiming: response.headers.get("server-timing") ?? "",
      };
    },
  };
}

async function authSignIn(client, email, password) {
  const result = await client.request(authUrl, "/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  if (!result.response.ok) {
    throw new Error(
      `sign-in failed for ${email}: HTTP ${result.response.status} ${JSON.stringify(result.body).slice(0, 240)}`,
    );
  }
  return result;
}

async function authSignUp(client, email, password, name) {
  const result = await client.request(authUrl, "/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name }),
  });
  if (result.response.ok) return result;
  if (result.response.status === 409 || result.response.status === 422) {
    return authSignIn(client, email, password);
  }
  throw new Error(
    `sign-up failed for ${email}: HTTP ${result.response.status} ${JSON.stringify(result.body).slice(0, 240)}`,
  );
}

function percentile(values, p) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

function summarize(records) {
  const durations = records.map((item) => item.ms);
  return {
    count: records.length,
    ok: records.filter((item) => item.ok).length,
    failed: records.filter((item) => !item.ok).length,
    min: durations.length ? Math.min(...durations) : 0,
    median: percentile(durations, 50),
    p95: percentile(durations, 95),
    max: durations.length ? Math.max(...durations) : 0,
  };
}

function printRouteSummary(routeName, summary) {
  console.log(
    `${routeName}: count=${summary.count} ok=${summary.ok} failed=${summary.failed} min=${summary.min.toFixed(1)}ms median=${summary.median.toFixed(1)}ms p95=${summary.p95.toFixed(1)}ms max=${summary.max.toFixed(1)}ms`,
  );
}

async function prepareUsers(maxUsers) {
  const seeded = [
    { key: "owner", email: ownerEmail, name: "Loadtest Owner", roleId: `${workspaceId}:owner`, authOnly: false },
    { key: "superadmin", email: "superadmin@example.local", name: "Loadtest Superadmin", roleId: null, authOnly: true },
    { key: "admin", email: "admin@example.local", name: "Loadtest Admin", roleId: `${workspaceId}:admin`, authOnly: false },
    { key: "editor", email: "editor@example.local", name: "Loadtest Editor", roleId: `${workspaceId}:editor`, authOnly: false },
    { key: "viewer", email: "viewer@example.local", name: "Loadtest Viewer", roleId: `${workspaceId}:viewer`, authOnly: false },
  ];
  const users = [];
  for (const account of seeded) {
    const client = createClient(account.key);
    await authSignIn(client, account.email, ownerPassword);
    if (account.roleId) {
      const userId = authUserIdByEmail(account.email);
      if (!userId)
        throw new Error(`Could not resolve user id for ${account.email}`);
      upsertWorkspaceMember(userId, account.email, account.roleId);
    }
    users.push({
      key: account.key,
      email: account.email,
      client,
      seeded: true,
    });
  }

  const extraCount = Math.max(0, maxUsers - users.length);
  for (let index = 0; index < extraCount; index += 1) {
    const email = `loadtest-${String(index + 1).padStart(3, "0")}@example.local`;
    const client = createClient(email);
    await authSignUp(
      client,
      email,
      ownerPassword,
      `Loadtest User ${String(index + 1).padStart(3, "0")}`,
    );
    const userId = authUserIdByEmail(email);
    if (!userId)
      throw new Error(`Could not resolve user id for ${email}`);
    upsertWorkspaceMember(userId, email, `${workspaceId}:viewer`);
    users.push({
      key: email,
      email,
      client,
      seeded: false,
    });
  }

  return users;
}

async function fetchUserScenario(user) {
  const results = [];
  const requests = [
    { name: "web /", base: webUrl, path: "/" },
    { name: "web /settings", base: webUrl, path: `/settings?${workspaceQuery}` },
    { name: "core /session", base: coreUrl, path: "/session" },
    {
      name: "core /bootstrap",
      base: coreUrl,
      path: `/bootstrap?workspaceId=${encodeURIComponent(workspaceId)}`,
    },
    {
      name: "core workspace bootstrap",
      base: coreUrl,
      path: `/workspaces/${encodeURIComponent(workspaceId)}/bootstrap`,
    },
  ];

  for (const request of requests) {
    const result = await user.client.request(request.base, request.path);
    results.push({
      name: request.name,
      ms: result.ms,
      ok: result.response.ok,
      status: result.response.status,
      detail: result.serverTiming,
    });
  }

  const tabsResult = await user.client.request(
    coreUrl,
    `/workspaces/${encodeURIComponent(workspaceId)}/settings/tabs`,
  );
  results.push({
    name: "core settings tabs",
    ms: tabsResult.ms,
    ok: tabsResult.response.ok,
    status: tabsResult.response.status,
    detail: tabsResult.serverTiming,
  });

  const tabs =
    tabsResult.response.ok && tabsResult.body && typeof tabsResult.body === "object"
      ? tabsResult.body.tabs
      : [];
  let targetTab = null;
  if (Array.isArray(tabs)) {
    const generalTab = tabs.find(
      (item) => item?.id === "platform.settings.general",
    );
    if (typeof generalTab?.id === "string") targetTab = generalTab.id;
    else if (typeof tabs[0]?.id === "string") targetTab = tabs[0].id;
  }

  if (targetTab) {
    const tabDetail = await user.client.request(
      coreUrl,
      `/workspaces/${encodeURIComponent(workspaceId)}/settings/tabs/${encodeURIComponent(targetTab)}`,
    );
    results.push({
      name: `core settings tab ${targetTab}`,
      ms: tabDetail.ms,
      ok: tabDetail.response.ok,
      status: tabDetail.response.status,
      detail: tabDetail.serverTiming,
    });

    const resolved =
      tabDetail.response.ok && tabDetail.body && typeof tabDetail.body === "object"
        ? tabDetail.body
        : null;
    const sections = Array.isArray(resolved?.panel?.sections)
      ? resolved.panel.sections
      : [];
    const firstSection = sections.find(
      (section) =>
        typeof section?.dataSourceId === "string" &&
        section.dataSourceId.trim(),
    );
    if (firstSection?.dataSourceId) {
      const runtimeData = await user.client.request(
        coreUrl,
        `/workspaces/${encodeURIComponent(workspaceId)}/settings/runtime/data`,
        {
          method: "POST",
          body: JSON.stringify({
            workspaceId,
            contributionId: targetTab,
            dataSourceId: firstSection.dataSourceId,
            routeParams: {},
            queryParams: {},
          }),
        },
      );
      results.push({
        name: `core settings runtime data ${targetTab}.${firstSection.dataSourceId}`,
        ms: runtimeData.ms,
        ok: runtimeData.response.ok,
        status: runtimeData.response.status,
        detail: runtimeData.serverTiming,
      });
    }
  }

  return results;
}

async function runCohort(count, users) {
  const selectedUsers = users.slice(0, count);
  const started = performance.now();
  const outcomes = await Promise.all(selectedUsers.map((user) => fetchUserScenario(user)));
  const totalMs = performance.now() - started;
  const flattened = outcomes.flat();
  const byRoute = new Map();
  for (const item of flattened) {
    const current = byRoute.get(item.name) ?? [];
    current.push(item);
    byRoute.set(item.name, current);
  }
  const failures = flattened.filter((item) => !item.ok);
  console.log(`\nCohort ${count} users: ${selectedUsers.length} sessions in ${totalMs.toFixed(1)}ms`);
  for (const [routeName, records] of byRoute.entries()) {
    printRouteSummary(routeName, summarize(records));
  }
  if (failures.length) {
    console.log("Failures:");
    for (const failure of failures.slice(0, 20)) {
      console.log(
        `  - ${failure.name}: HTTP ${failure.status}${failure.detail ? ` (${failure.detail})` : ""}`,
      );
    }
    if (failures.length > 20)
      console.log(`  - ... and ${failures.length - 20} more`);
  } else {
    console.log("Failures: none");
  }
  return { totalMs, failures: failures.length, byRoute };
}

async function main() {
  await ensureLocalDevStack({ authUrl, coreUrl, webUrl });
  seedWorkspaceBootstrap();

  const maxUsers = Math.max(...cohortSizes, 0);
  if (!maxUsers) throw new Error("No cohort sizes configured.");
  const users = await prepareUsers(maxUsers);

  console.log(
    `Load test prepared for workspace ${workspaceId}; cohorts=${cohortSizes.join(", ")}`,
  );
  console.log(
    `Accounts: owner + seeded demo accounts + ${Math.max(0, maxUsers - 5)} extra`,
  );

  const summaries = [];
  for (const count of cohortSizes) {
    summaries.push(await runCohort(count, users));
  }

  const totalFailures = summaries.reduce((sum, item) => sum + item.failures, 0);
  if (totalFailures) {
    console.error(`Load test completed with ${totalFailures} request failures.`);
    process.exit(1);
  }
  console.log("Load test completed successfully.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
