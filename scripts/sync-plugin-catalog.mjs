import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { strToU8, zipSync } from "fflate";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = path.join(root, "apps", "core-worker");

const catalog = [
  { module: "../plugins/ai-providers/manifest.ts", exportName: "aiProvidersPlugin", category: "ai", demoAvailable: false },
  { module: "../plugins/agent-ai/manifest.ts", exportName: "agentAiManifest", category: "ai", demoAvailable: false },
  { module: "../plugins/theme-studio/manifest.ts", exportName: "themeStudioPlugin", category: "design", demoAvailable: false },
  { module: "../plugins/local-node/manifest.ts", exportName: "localNodeManifest", category: "operations", demoAvailable: false },
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

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function pluginZip(manifest) {
  return zipSync({
    "plugin.json": strToU8(JSON.stringify({
      manifest,
      worker: { isolation: "none" },
      ui: { mode: "declarative" },
    }, null, 2)),
  });
}

const config = readJsonc(path.join(coreDir, "wrangler.jsonc"));
const database = config.d1_databases?.find((item) => item.binding === "CORE_DB")?.database_name;
if (!database) throw new Error("CORE_DB database_name is missing from apps/core-worker/wrangler.jsonc");

const rows = await Promise.all(catalog.map(async (entry) => {
  const module = await import(entry.module);
  const manifest = module[entry.exportName];
  if (!manifest?.id) throw new Error(`Missing ${entry.exportName} in ${entry.module}`);
  const zip = pluginZip(manifest);
  const digest = sha256(zip);
  const objectKey = `dev-official/${manifest.id}-${manifest.version}-${digest.slice(0, 12)}.zip`;
  return { ...entry, manifest, zip, sha256: digest, objectKey };
}));

const statements = rows.flatMap(({ manifest, category, demoAvailable, sha256: digest, objectKey, zip }) => [`INSERT INTO plugin_catalog (plugin_id, name, version, manifest_json, category, demo_available, source, updated_at)
VALUES ('${sql(manifest.id)}', '${sql(manifest.name)}', '${sql(manifest.version)}', '${sql(JSON.stringify(manifest))}', '${sql(category)}', ${demoAvailable ? 1 : 0}, 'official', CURRENT_TIMESTAMP)
ON CONFLICT(plugin_id) DO UPDATE SET name = excluded.name, version = excluded.version, manifest_json = excluded.manifest_json, category = excluded.category, demo_available = excluded.demo_available, source = excluded.source, updated_at = CURRENT_TIMESTAMP;`,
`INSERT INTO plugin_catalog_releases (id, plugin_id, version, manifest_json, package_object_key, sha256, size_bytes, format, worker_isolation, ui_mode, status, source, published_at, updated_at)
VALUES ('${sql(`${manifest.id}@${manifest.version}:${digest}`)}', '${sql(manifest.id)}', '${sql(manifest.version)}', '${sql(JSON.stringify(manifest))}', '${sql(objectKey)}', '${digest}', ${zip.byteLength}, 'zip', 'none', 'declarative', 'published', 'official-dev-seed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT(plugin_id, version, sha256) DO UPDATE SET manifest_json = excluded.manifest_json, package_object_key = excluded.package_object_key, size_bytes = excluded.size_bytes, status = 'published', source = excluded.source, published_at = COALESCE(plugin_catalog_releases.published_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP;`]);

const file = path.join(os.tmpdir(), `v2-plugin-catalog-${process.pid}.sql`);
fs.writeFileSync(file, `${statements.join("\n")}\n`);
try {
  run(["d1", "migrations", "apply", database, "--local"]);
  for (const row of rows) {
    const zipFile = path.join(os.tmpdir(), `v2-${row.manifest.id}-${process.pid}.zip`);
    fs.writeFileSync(zipFile, row.zip);
    try {
      run(["r2", "object", "put", `${config.r2_buckets?.find((item) => item.binding === "PLUGIN_PACKAGES")?.bucket_name ?? "v2-plugin-packages"}/${row.objectKey}`, "--file", zipFile, "--local", "--content-type", "application/zip"]);
    } finally {
      fs.rmSync(zipFile, { force: true });
    }
  }
  run(["d1", "execute", database, "--local", "--file", file]);
  console.log(`Seeded ${rows.length} Marketplace catalog identities and published local ZIP releases into ${database}. This is a dev helper only; production release publishing stays runtime/API driven.`);
} finally {
  fs.rmSync(file, { force: true });
}
