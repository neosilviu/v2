#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const repositoryPath = new URL("../apps/core-worker/src/repository.ts", import.meta.url);
const indexPath = new URL("../apps/core-worker/src/index.ts", import.meta.url);
const apiPath = new URL("../apps/web/src/api.ts", import.meta.url);
const workerPath = new URL("../apps/core-worker/src/worker.ts", import.meta.url);

function replaceOnce(content, search, replacement, label) {
  if (!content.includes(search)) throw new Error(`Could not find ${label}. File may already be migrated or code has changed.`);
  return content.replace(search, replacement);
}

async function migrateRepository() {
  let content = await readFile(repositoryPath, "utf8");
  content = replaceOnce(
    content,
    'import { declarativePageContributionSchema, publicRoutePatternSchema, settingsPanelContributionSchema, settingsTabContributionSchema, type AccessMode, type DeclarativePageContribution, type SettingsPanelContribution, type SettingsTabContribution } from "@v2/ui-schema";',
    'import { declarativePageContributionSchema, publicRoutePatternSchema, settingsPanelContributionSchema, settingsTabContributionSchema, type AccessMode, type DeclarativePageContribution, type SettingsPanelContribution, type SettingsTabContribution } from "@v2/ui-schema";\nimport { platformSettingsTabs } from "./platform-settings";',
    "repository platform-settings import",
  );
  content = content.replace('const PLATFORM_SETTINGS_SEED_VERSION = "platform-settings:v2";', 'const PLATFORM_SETTINGS_SEED_VERSION = "platform-settings:v3";');

  const methodStart = content.indexOf("  private platformSettingsTabs(): SettingsTabResolution[] {");
  const methodEndMarker = "\n\n  async ensurePlatformSettingsContributions(workspaceId: string) {";
  const methodEnd = content.indexOf(methodEndMarker, methodStart);
  if (methodStart < 0 || methodEnd < 0) throw new Error("Could not find legacy platformSettingsTabs method in repository.ts.");
  content = content.slice(0, methodStart) + content.slice(methodEnd + 2);
  content = replaceOnce(content, "for (const item of this.platformSettingsTabs())", "for (const item of platformSettingsTabs())", "repository compact settings call");
  await writeFile(repositoryPath, content);
}

async function migrateIndex() {
  let content = await readFile(indexPath, "utf8");
  const legacyTabs = 'coreApiRoutes.get("/workspaces/:workspaceId/settings/tabs", async (c) => { const workspaceId = c.req.param("workspaceId"); const denied = await requirePermission(c, workspaceId, "workspace.settings.read"); if (denied) return denied; return c.json({ tabs: await new CoreRepository(c.env.CORE_DB).settingsTabsForWorkspace(workspaceId) }); });\n';
  const legacyTab = 'coreApiRoutes.get("/workspaces/:workspaceId/settings/tabs/:tabId", async (c) => { const workspaceId = c.req.param("workspaceId"); const denied = await requirePermission(c, workspaceId, "workspace.settings.read"); if (denied) return denied; const resolution = await new CoreRepository(c.env.CORE_DB).resolveSettingsTab(workspaceId, c.req.param("tabId")); return resolution ? c.json(resolution) : c.json(errorResponse(failure("not_found", "Settings tab is not available.")), 404); });\n';
  content = replaceOnce(content, legacyTabs, "", "legacy settings tabs route");
  content = replaceOnce(content, legacyTab, "", "legacy settings tab route");
  await writeFile(indexPath, content);
}

async function migrateWebApi() {
  let content = await readFile(apiPath, "utf8");
  content = replaceOnce(
    content,
    'coreApi.workspaces[":workspaceId"].settings.tabs.$get({ param: { workspaceId: currentWorkspaceId() } })',
    'coreApi.workspaces[":workspaceId"].settings.schema.tabs.$get({ param: { workspaceId: currentWorkspaceId() } })',
    "web settings tabs client call",
  );
  content = replaceOnce(
    content,
    'coreApi.workspaces[":workspaceId"].settings.tabs[":tabId"].$get({ param: { workspaceId: currentWorkspaceId(), tabId } })',
    'coreApi.workspaces[":workspaceId"].settings.schema.tabs[":tabId"].$get({ param: { workspaceId: currentWorkspaceId(), tabId } })',
    "web settings tab client call",
  );
  await writeFile(apiPath, content);
}

async function verifyWorker() {
  const content = await readFile(workerPath, "utf8");
  if (!content.includes('app.route("/", createPlatformSettingsRoutes());')) throw new Error("Compact platform settings router is not mounted in worker.ts.");
}

await migrateRepository();
await migrateIndex();
await migrateWebApi();
await verifyWorker();
console.log("Compact Settings migration applied:");
console.log("- Web now uses /settings/schema/tabs");
console.log("- legacy Core tab routes removed from index.ts");
console.log("- repository legacy platformSettingsTabs removed");
console.log("- seed upgraded to platform-settings:v3 for stored plugin contributions");
