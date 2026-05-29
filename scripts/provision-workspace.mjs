#!/usr/bin/env node
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
function value(name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 ? String(args[index + 1] ?? fallback) : fallback;
}
function flag(name) {
  return args.includes(name);
}
function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

const workspaceId = value("--workspace", "default");
const workspaceName = value("--name", "Default Workspace");
const ownerEmail = value("--owner", "").trim().toLowerCase();
const adminDomain = value("--admin-domain", "");
const authDomain = value("--auth-domain", "");
const ttlHours = Number(value("--ttl-hours", "24")) || 24;
const local = flag("--local");
const execute = flag("--execute") || local;
const printToken = flag("--print-token") || flag("--break-glass-print-token");
const coreUrl = value("--core-url", process.env.CORE_PROVISION_URL || "");
const provisioningSecret = value("--provisioning-secret", process.env.CORE_PROVISIONING_SECRET || "");

if (!ownerEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail)) {
  console.error("Missing or invalid --owner email.");
  process.exit(1);
}

const token = crypto.randomBytes(32).toString("base64url");
const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
const requestId = crypto.randomUUID();
const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
const setupUrl = `/setup/owner?token=${encodeURIComponent(token)}`;

if (!local && coreUrl) {
  const response = await fetch(new URL("/internal/provision/workspace", coreUrl), {
    method: "POST",
    headers: { "content-type": "application/json", ...(provisioningSecret ? { "x-v2-provisioning-secret": provisioningSecret } : {}) },
    body: JSON.stringify({ workspaceId, workspaceName, ownerEmail, ttlHours, setupBaseUrl: value("--setup-base-url", process.env.SETUP_BASE_URL || ""), breakGlassPrintToken: printToken }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }
  console.log("Workspace provisioning request created through Core.");
  console.log(`Workspace: ${workspaceId}`);
  console.log(`Owner: ${ownerEmail}`);
  console.log(`Expires: ${payload.expiresAt ?? expiresAt}`);
  console.log(`Mail event: ${payload.mailEventId ?? "unknown"}`);
  if (printToken && payload.setupUrl) console.log(`Break-glass one-time setup URL: ${payload.setupUrl}`);
  else console.log("One-time setup URL suppressed. Core Mail Runtime sent owner_setup.");
  process.exit(0);
}

if (!local && !coreUrl) {
  console.error("Production provisioning must call Core. Set --core-url or CORE_PROVISION_URL. Use --local only for development D1 bootstrap.");
  process.exit(1);
}

const permissions = [
  "workspace.read", "workspace.admin", "workspace.members.manage", "workspace.settings.read", "workspace.settings.write",
  "auth.read", "auth.admin", "auth.method.publish", "auth.policy.write", "auth.ui.publish", "auth.session.read",
  "domains.read", "domains.write", "domains.verify", "mail.read", "mail.configure", "mail.test", "mail.template.write",
  "marketplace.read", "marketplace.publish", "plugin.install", "plugin.activate", "plugin.update", "plugin.uninstall", "plugin.grantCapability",
  "approval.read", "tool.approve", "audit.read", "layout.read", "layout.write", "publication.read", "publication.publish",
  "agent.read", "agent.use", "provider.read", "provider.configure", "localnode.read", "localnode.configure", "localnode.execute",
  "production.read", "production.execute", "production.approve",
];
const roleSpecs = [
  ["owner", "Owner", permissions],
  ["admin", "Admin", ["workspace.read", "workspace.settings.read", "workspace.settings.write", "domains.read", "domains.write", "domains.verify", "mail.read", "mail.configure", "mail.test", "mail.template.write", "marketplace.read", "plugin.install", "plugin.activate", "plugin.update", "plugin.uninstall", "approval.read", "tool.approve", "audit.read", "layout.read", "layout.write", "interface.read", "interface.write", "publication.read", "publication.publish", "plan.read"]],
  ["editor", "Editor", ["workspace.read", "workspace.settings.read", "layout.read", "layout.write", "interface.read", "interface.write", "publication.read", "publication.publish"]],
  ["viewer", "Viewer", ["workspace.read", "workspace.settings.read", "layout.read", "interface.read", "publication.read"]],
];

const statements = [
  `INSERT INTO workspaces (id, name, status, updated_at) VALUES (${sqlString(workspaceId)}, ${sqlString(workspaceName)}, 'provisioning', CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET name = excluded.name, status = 'provisioning', updated_at = CURRENT_TIMESTAMP;`,
  ...roleSpecs.flatMap(([key, label, rolePermissions]) => [
    `INSERT INTO workspace_roles (id, workspace_id, name, system_key, description, updated_at)
VALUES (${sqlString(`${workspaceId}:${key}`)}, ${sqlString(workspaceId)}, ${sqlString(label)}, ${sqlString(key)}, ${sqlString(`${label} role`)}, CURRENT_TIMESTAMP)
ON CONFLICT(id) DO UPDATE SET name = excluded.name, system_key = excluded.system_key, updated_at = CURRENT_TIMESTAMP;`,
    ...rolePermissions.map((permission) => `INSERT OR IGNORE INTO workspace_role_permissions (workspace_id, role_id, permission) VALUES (${sqlString(workspaceId)}, ${sqlString(`${workspaceId}:${key}`)}, ${sqlString(permission)});`),
  ]),
  `UPDATE workspace_provisioning_requests SET status = 'revoked' WHERE workspace_id = ${sqlString(workspaceId)} AND status = 'pending';`,
  `INSERT INTO workspace_provisioning_requests (id, workspace_id, owner_email, status, token_hash, expires_at, created_by, metadata_json)
VALUES (${sqlString(requestId)}, ${sqlString(workspaceId)}, ${sqlString(ownerEmail)}, 'pending', ${sqlString(tokenHash)}, ${sqlString(expiresAt)}, 'provision:workspace:prod', ${sqlString(JSON.stringify({ adminDomain, authDomain }))});`,
  `INSERT OR IGNORE INTO workspace_settings (workspace_id, scope, key, value_json) VALUES (${sqlString(workspaceId)}, 'platform', 'workspaceName', ${sqlString(JSON.stringify(workspaceName))});`,
  `INSERT OR IGNORE INTO workspace_settings (workspace_id, scope, key, value_json) VALUES (${sqlString(workspaceId)}, 'platform', 'locale', ${sqlString(JSON.stringify("ro-RO"))});`,
  `INSERT OR IGNORE INTO workspace_settings (workspace_id, scope, key, value_json) VALUES (${sqlString(workspaceId)}, 'platform', 'timezone', ${sqlString(JSON.stringify("Europe/Bucharest"))});`,
  `INSERT OR IGNORE INTO workspace_settings (workspace_id, scope, key, value_json) VALUES (${sqlString(workspaceId)}, 'platform', 'currency', ${sqlString(JSON.stringify("RON"))});`,
  adminDomain ? `INSERT OR IGNORE INTO workspace_domains (id, workspace_id, hostname, kind, status, verification_method, is_primary) VALUES (${sqlString(crypto.randomUUID())}, ${sqlString(workspaceId)}, ${sqlString(adminDomain.toLowerCase())}, 'admin', 'verifying', 'manual', 1);` : "",
  authDomain ? `INSERT OR IGNORE INTO workspace_domains (id, workspace_id, hostname, kind, status, verification_method, is_primary) VALUES (${sqlString(crypto.randomUUID())}, ${sqlString(workspaceId)}, ${sqlString(authDomain.toLowerCase())}, 'auth', 'verifying', 'manual', 1);` : "",
  `INSERT INTO audit_events (id, workspace_id, actor_id, action, payload_json) VALUES (${sqlString(crypto.randomUUID())}, ${sqlString(workspaceId)}, 'provision:workspace:prod', 'workspace.provisioning.request.created', ${sqlString(JSON.stringify({ ownerEmail, expiresAt }))});`,
].filter(Boolean);

const sql = statements.join("\n");
if (execute) {
  const wranglerArgs = ["--dir", "apps/core-worker", "exec", "wrangler", "d1", "execute", "v2-core", "--command", sql];
  if (local) wranglerArgs.splice(-2, 0, "--local");
  const result = spawnSync("pnpm", wranglerArgs, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  if (local) await new Promise((resolve) => setTimeout(resolve, 1000));
} else {
  console.log(sql);
}

console.log("Workspace provisioning request created.");
console.log(`Workspace: ${workspaceId}`);
console.log(`Owner: ${ownerEmail}`);
console.log(`Expires: ${expiresAt}`);
if (printToken) {
  console.log(`Break-glass one-time setup URL: ${setupUrl}`);
} else {
  console.log("One-time setup URL suppressed. Send owner_setup through Core Mail Runtime or rerun with --break-glass-print-token for explicit recovery.");
}
