#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const indexPath = new URL("../apps/core-worker/src/index.ts", import.meta.url);
const routesPath = new URL("../apps/core-worker/src/platform-settings-routes.ts", import.meta.url);

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Could not find ${label}. The local file differs from the expected migrated state.`);
  return source.replace(before, after);
}

async function fixIndex() {
  let content = await readFile(indexPath, "utf8");
  const original = content;

  content = content.replace('import { ApprovalRequestRepository } from "./approvals";\n', "");
  content = replaceRequired(
    content,
    'function isPlatformAdmin(env: CoreEnv, user: { email: string } | null | undefined) {\n  return Boolean(user && env.PLATFORM_ADMIN_EMAIL && user.email.toLowerCase() === env.PLATFORM_ADMIN_EMAIL.toLowerCase());\n}',
    'function isPlatformAdmin(env: CoreEnv, user: { email: string } | null | undefined) {\n  const admins = new Set((env.PLATFORM_ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));\n  return Boolean(user && admins.has(user.email.toLowerCase()));\n}',
    "platform admin email configuration",
  );
  content = replaceRequired(
    content,
    'async function authAdminJson<T>(c: CoreContext, path: string, init?: RequestInit): Promise<T> {\n  const headers = new Headers(init?.headers);\n  const cookie = c.req.header("cookie");\n  const authorization = c.req.header("authorization");\n  if (cookie) headers.set("cookie", cookie);\n  if (authorization) headers.set("authorization", authorization);\n  if (init?.body) headers.set("content-type", "application/json");\n  const response = await c.env.AUTH.fetch(`https://auth.internal${path}`, { ...init, headers });\n  if (!response.ok) throw new Error(`Auth administration failed: ${response.status}`);\n  return response.json() as Promise<T>;\n}',
    'async function authAdminJson<T>(c: CoreContext, path: string, init?: { method?: string; body?: string }): Promise<T> {\n  const headers = new Headers();\n  const cookie = c.req.header("cookie");\n  const authorization = c.req.header("authorization");\n  if (cookie) headers.set("cookie", cookie);\n  if (authorization) headers.set("authorization", authorization);\n  if (init?.body) headers.set("content-type", "application/json");\n  const response = await c.env.AUTH.fetch(`https://auth.internal${path}`, { method: init?.method, body: init?.body, headers });\n  if (!response.ok) throw new Error(`Auth administration failed: ${response.status}`);\n  return response.json() as Promise<T>;\n}',
    "Auth admin fetch input",
  );
  content = replaceRequired(
    content,
    'function normalizeEmptyString(value: unknown) { return value === "" ? null : value; }\nfunction objectInput(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }',
    'function normalizeEmptyString(value: unknown) { return value === "" ? null : value; }\nfunction objectInput(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }\nfunction domainKind(value: unknown): "admin" | "auth" | "website" | "storefront" | "public-chat" | "mail" {\n  return value === "admin" || value === "auth" || value === "storefront" || value === "public-chat" || value === "mail" ? value : "website";\n}\nfunction domainVerification(value: unknown): "manual" | "dns-txt" | "dns-cname" {\n  return value === "dns-txt" || value === "dns-cname" ? value : "manual";\n}',
    "domain input parsers",
  );
  content = content.replace(
    'kind: String(value.kind ?? "website"), verificationMethod: String(value.verificationMethod ?? "manual")',
    'kind: domainKind(value.kind), verificationMethod: domainVerification(value.verificationMethod)',
  );
  content = content.replace(/^coreApiRoutes\.get\("\/workspaces\/:workspaceId\/settings\/tabs".*\n/m, "");
  content = content.replace(/^coreApiRoutes\.get\("\/workspaces\/:workspaceId\/settings\/tabs\/:tabId".*\n/m, "");

  if (content !== original) await writeFile(indexPath, content);
}

async function fixPlatformRoutes() {
  let content = await readFile(routesPath, "utf8");
  const original = content;
  content = content.replace('import { CoreRepository, type WorkspacePermission } from "./repository";', 'import type { WorkspacePermission } from "./repository";');
  content = content.replace('    const repo = new CoreRepository(c.env.CORE_DB);\n    const compact = platformSettingsTabs().map(({ tab }) => tab);\n    const pluginTabs = (await repo.settingsTabsForWorkspace(workspaceId)).filter((tab) => tab.pluginId !== "platform");\n    return c.json({ tabs: [...compact, ...pluginTabs].sort((left, right) => left.displayOrder - right.displayOrder) });', '    const tabs = platformSettingsTabs().map(({ tab }) => tab).sort((left, right) => left.displayOrder - right.displayOrder);\n    return c.json({ tabs });');
  content = content.replace('    const compact = platformSettingsTabs().find((entry) => entry.tab.id === tabId);\n    if (compact) return c.json(compact);\n    const resolution = await new CoreRepository(c.env.CORE_DB).resolveSettingsTab(workspaceId, tabId);\n    return resolution ? c.json(resolution) : c.json(errorResponse(failure("not_found", "Settings tab is not available.")), 404);', '    const compact = platformSettingsTabs().find((entry) => entry.tab.id === tabId);\n    return compact ? c.json(compact) : c.json(errorResponse(failure("not_found", "Settings tab is not available.")), 404);');
  if (content !== original) await writeFile(routesPath, content);
}

await fixIndex();
await fixPlatformRoutes();
console.log("Core typecheck repair applied. Run: pnpm typecheck");
