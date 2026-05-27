#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const allowed = new Set([
  join(root, "apps/web/src/auth-client.ts"),
  join(root, "apps/web/src/api.ts"),
]);
const files = [
  "apps/web/src/App.tsx",
  "apps/web/src/LoginPage.tsx",
  "apps/web/src/SettingsPage.tsx",
  "apps/web/src/PublicPage.tsx",
  "apps/web/src/platform/PluginManagerPanel.tsx",
  "apps/web/src/platform/DeclarativeSurface.tsx",
  "apps/web/src/auth-api.ts",
  "apps/web/src/api.ts",
].map((path) => join(root, path));

let failed = false;
for (const file of files) {
  if (allowed.has(file)) continue;
  const source = readFileSync(file, "utf8");
  if (/\bfetch\s*\(/.test(source)) {
    console.error(`Manual fetch is not allowed in migrated Web API consumers: ${file}`);
    failed = true;
  }
}
if (failed) process.exit(1);
