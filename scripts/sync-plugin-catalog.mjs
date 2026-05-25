import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = path.join(root, "apps", "core-worker");

const catalog = [
  { module: "../plugins/ai-providers/src/index.ts", exportName: "aiProvidersPlugin", category: "ai", demoAvailable: false },
  { module: "../plugins/agent-ai/manifest.ts", exportName: "agentAiManifest", category: "ai", demoAvailable: false },
  { module: "../plugins/theme-studio/src/index.ts", exportName: "themeStudioPlugin", category: "design", demoAvailable: false },
  { module: "../plugins/website-studio/manifest.ts", exportName: "websiteStudioManifest", category: "site", demoAvailable: true },
  { module: "../plugins/commerce/manifest.ts", exportName: "commerceManifest", category: "commerce", demoAvailable: true },
];

function readJsonc(file) {
  const source = fs.readFileSync(file, "utf8");
  return JSON.parse(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/,\s*([}\]])/g, "$1"));
}

function sql(value) {
  return String(value).replaceAll("'", "''");
}

function run(args) {
  const result = spawnSync("pnpm", ["--dir", coreDir, "exec", "wrangler", ...args], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const config = readJsonc(path.join(coreDir, "wrangler.jsonc"));
const database = config.d1_databases?.find((item) => item.binding === "CORE_DB")?.database_name;
if (!database) throw new Error("CORE_DB database_name is missing from apps/core-worker/wrangler.jsonc");

const rows = await Promise.all(catalog.map(async (entry) => {
  const module = await import(entry.module);
  const manifest = module[entry.exportName];
  if (!manifest?.id) throw new Error(`Missing ${entry.exportName} in ${entry.module}`);
  return { ...entry, manifest };
}));

const statements = rows.map(({ manifest, category, demoAvailable }) => `INSERT INTO plugin_catalog (plugin_id, name, version, manifest_json, category, demo_available, source, updated_at)
VALUES ('${sql(manifest.id)}', '${sql(manifest.name)}', '${sql(manifest.version)}', '${sql(JSON.stringify(manifest))}', '${sql(category)}', ${demoAvailable ? 1 : 0}, 'official', CURRENT_TIMESTAMP)
ON CONFLICT(plugin_id) DO UPDATE SET name = excluded.name, version = excluded.version, manifest_json = excluded.manifest_json, category = excluded.category, demo_available = excluded.demo_available, source = excluded.source, updated_at = CURRENT_TIMESTAMP;`);

const file = path.join(os.tmpdir(), `v2-plugin-catalog-${process.pid}.sql`);
fs.writeFileSync(file, `${statements.join("\n")}\n`);
try {
  run(["d1", "migrations", "apply", database, "--local"]);
  run(["d1", "execute", database, "--local", "--file", file]);
  console.log(`Seeded ${rows.length} Marketplace catalog identities into ${database}. Publish ZIP releases through Core before installing from Marketplace.`);
} finally {
  fs.rmSync(file, { force: true });
}
