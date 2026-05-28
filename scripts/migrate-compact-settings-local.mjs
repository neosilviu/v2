#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const repositoryPath = new URL("../apps/core-worker/src/repository.ts", import.meta.url);
const indexPath = new URL("../apps/core-worker/src/index.ts", import.meta.url);
const apiPath = new URL("../apps/web/src/api.ts", import.meta.url);
const workerPath = new URL("../apps/core-worker/src/worker.ts", import.meta.url);

const changed = [];
const skipped = [];

function noteChanged(label) { changed.push(label); }
function noteSkipped(label) { skipped.push(label); }

async function migrateRepository() {
  let content = await readFile(repositoryPath, "utf8");
  const original = content;
  const importLine = 'import { platformSettingsTabs } from "./platform-settings";';
  if (!content.includes(importLine)) {
    const anchor = /import\s+\{[^\n]*declarativePageContributionSchema[^\n]*\}\s+from\s+["']@v2\/ui-schema["'];/;
    if (!anchor.test(content)) throw new Error("Could not locate the @v2/ui-schema import in repository.ts.");
    content = content.replace(anchor, (match) => `${match}\n${importLine}`);
    noteChanged("repository import switched to compact settings source");
  } else {
    noteSkipped("repository compact settings import already present");
  }

  if (content.includes('const PLATFORM_SETTINGS_SEED_VERSION = "platform-settings:v2";')) {
    content = content.replace('const PLATFORM_SETTINGS_SEED_VERSION = "platform-settings:v2";', 'const PLATFORM_SETTINGS_SEED_VERSION = "platform-settings:v3";');
    noteChanged("settings seed upgraded to v3");
  } else if (content.includes('const PLATFORM_SETTINGS_SEED_VERSION = "platform-settings:v3";')) {
    noteSkipped("settings seed already at v3");
  } else {
    noteSkipped("settings seed constant absent; compact routes no longer require platform seed");
  }

  const legacyStartPattern = /\n  private platformSettingsTabs\(\):\s*SettingsTabResolution\[\]\s*\{/;
  const legacyStartMatch = legacyStartPattern.exec(content);
  if (legacyStartMatch) {
    const methodStart = legacyStartMatch.index;
    const methodEndMarker = "\n\n  async ensurePlatformSettingsContributions(workspaceId: string) {";
    const methodEnd = content.indexOf(methodEndMarker, methodStart);
    if (methodEnd < 0) throw new Error("Found legacy platformSettingsTabs start but not its end marker in repository.ts.");
    content = content.slice(0, methodStart) + content.slice(methodEnd);
    noteChanged("legacy repository platformSettingsTabs method removed");
  } else {
    noteSkipped("legacy repository platformSettingsTabs method already absent");
  }

  if (content.includes("for (const item of this.platformSettingsTabs())")) {
    content = content.replaceAll("for (const item of this.platformSettingsTabs())", "for (const item of platformSettingsTabs())");
    noteChanged("remaining settings seed now uses compact declarations");
  } else if (content.includes("for (const item of platformSettingsTabs())")) {
    noteSkipped("settings seed already uses compact declarations");
  } else {
    noteSkipped("no platform settings seed loop found");
  }

  if (content !== original) await writeFile(repositoryPath, content);
}

async function migrateIndex() {
  let content = await readFile(indexPath, "utf8");
  const original = content;
  const routes = [
    /\n?coreApiRoutes\.get\("\/workspaces\/:workspaceId\/settings\/tabs",[\s\S]*?\n(?=coreApiRoutes\.|export\s+type\s+CoreApi|export\s+default)/,
    /\n?coreApiRoutes\.get\("\/workspaces\/:workspaceId\/settings\/tabs\/:tabId",[\s\S]*?\n(?=coreApiRoutes\.|export\s+type\s+CoreApi|export\s+default)/,
  ];
  let removed = 0;
  for (const route of routes) {
    if (route.test(content)) {
      content = content.replace(route, "\n");
      removed += 1;
    }
  }
  if (removed) noteChanged(`removed ${removed} legacy settings tab route(s) from Core API`);
  else noteSkipped("legacy settings tab routes already absent or formatted differently");
  if (content !== original) await writeFile(indexPath, content);
}

async function migrateWebApi() {
  let content = await readFile(apiPath, "utf8");
  const original = content;
  const replacements = [
    [
      'coreApi.workspaces[":workspaceId"].settings.tabs.$get({ param: { workspaceId: currentWorkspaceId() } })',
      'coreApi.workspaces[":workspaceId"].settings.schema.tabs.$get({ param: { workspaceId: currentWorkspaceId() } })',
      "settings tabs client endpoint",
    ],
    [
      'coreApi.workspaces[":workspaceId"].settings.tabs[":tabId"].$get({ param: { workspaceId: currentWorkspaceId(), tabId } })',
      'coreApi.workspaces[":workspaceId"].settings.schema.tabs[":tabId"].$get({ param: { workspaceId: currentWorkspaceId(), tabId } })',
      "settings panel client endpoint",
    ],
  ];
  for (const [before, after, label] of replacements) {
    if (content.includes(after)) noteSkipped(`${label} already compact`);
    else if (content.includes(before)) {
      content = content.replace(before, after);
      noteChanged(`${label} switched to /settings/schema`);
    } else {
      throw new Error(`Could not locate ${label} in apps/web/src/api.ts.`);
    }
  }
  if (content !== original) await writeFile(apiPath, content);
}

async function verifyWorker() {
  const content = await readFile(workerPath, "utf8");
  if (!content.includes('app.route("/", createPlatformSettingsRoutes());')) throw new Error("Compact platform settings router is not mounted in worker.ts.");
  noteSkipped("compact platform settings router is mounted");
}

await migrateRepository();
await migrateIndex();
await migrateWebApi();
await verifyWorker();
console.log("Compact Settings migration completed.");
for (const entry of changed) console.log(`CHANGED: ${entry}`);
for (const entry of skipped) console.log(`OK: ${entry}`);
