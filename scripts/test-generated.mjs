import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { codeExtensions, relativePath, walk, workspaceDirectories } from "./build-analysis/common.mjs";
import { pluginManifestSchema } from "../packages/plugin-contracts/src/index.ts";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];
const notes = [];

function pass(message) {
  console.log(`✓ ${message}`);
}

function fail(message) {
  failures.push(message);
  console.error(`✗ ${message}`);
}

function note(message) {
  notes.push(message);
  console.log(`- ${message}`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function discoverPluginManifests() {
  const candidates = workspaceDirectories(root)
    .filter((directory) => relativePath(root, directory).startsWith("plugins/"))
    .flatMap((directory) => {
      const manifest = path.join(directory, "manifest.ts");
      return fs.existsSync(manifest) ? [manifest] : [path.join(directory, "src/index.ts")];
    })
    .filter((file) => fs.existsSync(file));
  const discovered = [];
  for (const file of candidates) {
    const module = await import(pathToFileURL(file).href);
    for (const [exportName, value] of Object.entries(module)) {
      const parsed = pluginManifestSchema.safeParse(value);
      if (parsed.success) discovered.push({ file, exportName, manifest: parsed.data });
    }
  }
  return discovered;
}

function assertUnique(items, label, owner) {
  const seen = new Map();
  for (const item of items) {
    if (seen.has(item.id)) fail(`${label} id '${item.id}' is duplicated in ${owner} and ${seen.get(item.id)}`);
    else seen.set(item.id, owner);
  }
}

function testManifestContracts(manifests) {
  if (!manifests.length) {
    fail("No plugin manifests were discovered from plugins/*");
    return;
  }
  pass(`Discovered ${manifests.length} plugin manifests`);
  assertUnique(manifests.map((item) => ({ id: item.manifest.id })), "plugin", "plugin manifests");
  const globalIds = { tools: new Map(), providers: new Map(), surfaces: new Map(), publicRoutes: new Map(), publicSurfaces: new Map(), publicTools: new Map() };
  for (const item of manifests) {
    const owner = `${relativePath(root, item.file)}#${item.exportName}`;
    const contributions = item.manifest.contributes;
    assertUnique(contributions.tools, "tool", owner);
    assertUnique(contributions.providers, "provider", owner);
    assertUnique(contributions.surfaces, "surface", owner);
    assertUnique(contributions.publicRoutes, "public route", owner);
    assertUnique(contributions.publicSurfaces, "public surface", owner);
    assertUnique(contributions.publicTools, "public tool", owner);
    for (const [group, collection] of Object.entries({
      tools: contributions.tools,
      providers: contributions.providers,
      surfaces: contributions.surfaces,
      publicRoutes: contributions.publicRoutes,
      publicSurfaces: contributions.publicSurfaces,
      publicTools: contributions.publicTools,
    })) {
      for (const contribution of collection) {
        if (globalIds[group].has(contribution.id)) fail(`${group} id '${contribution.id}' is duplicated across ${owner} and ${globalIds[group].get(contribution.id)}`);
        else globalIds[group].set(contribution.id, owner);
      }
    }
    const surfaceIds = new Set(contributions.surfaces.map((surface) => surface.id));
    const toolIds = new Set(contributions.tools.map((tool) => tool.id));
    for (const contribution of contributions.publicRoutes) {
      if (contribution.surfaceId && !surfaceIds.has(contribution.surfaceId)) fail(`public route '${contribution.id}' in ${owner} references missing surface '${contribution.surfaceId}'`);
    }
    for (const contribution of contributions.publicSurfaces) {
      if (!surfaceIds.has(contribution.surfaceId)) fail(`public surface '${contribution.id}' in ${owner} references missing surface '${contribution.surfaceId}'`);
    }
    for (const contribution of contributions.publicTools) {
      if (!toolIds.has(contribution.toolId)) fail(`public tool '${contribution.id}' in ${owner} references missing tool '${contribution.toolId}'`);
    }
    const sensitive = item.manifest.capabilities.filter((capability) => capability.risk === "sensitive" || capability.risk === "dangerous");
    if (sensitive.length) note(`${item.manifest.id} declares ${sensitive.length} sensitive/dangerous capability candidate(s); grant remains policy-controlled`);
  }
}

function testRuntimeFirstArchitecture() {
  const platformRoots = ["apps/core-worker/src", "apps/web/src"].map((directory) => path.join(root, directory));
  const forbiddenPluginIds = ["website-studio", "commerce", "agent-ai"];
  const forbiddenPublicRoutes = ["/website", "/commerce", "/ai-chat"];
  const allowedFiles = new Set(["apps/web/src/platform/TrustedNativeSurface.tsx"]);
  for (const base of platformRoots) {
    for (const file of walk(base).filter((item) => codeExtensions.has(path.extname(item)))) {
      const relative = relativePath(root, file);
      const source = fs.readFileSync(file, "utf8");
      if (!allowedFiles.has(relative)) {
        for (const id of forbiddenPluginIds) {
          if (source.includes(id)) fail(`${relative} hardcodes feature plugin id '${id}'`);
        }
      }
      for (const route of forbiddenPublicRoutes) {
        if (source.includes(route)) fail(`${relative} hardcodes feature public route '${route}'`);
      }
    }
  }
  const coreIndex = fs.readFileSync(path.join(root, "apps/core-worker/src/index.ts"), "utf8");
  for (const route of ["/runtime/plugins", "/runtime/tools", "/runtime/providers", "/plugins/installed", "/workspaces/:workspaceId/plugins", "/workspaces/:workspaceId/settings/:scope", "/workspaces/:workspaceId/layout"]) {
    const routePosition = coreIndex.indexOf(`app.get("${route}"`);
    if (routePosition < 0) fail(`Core route ${route} is missing from static auth matrix`);
    else {
      const body = coreIndex.slice(routePosition, routePosition + 360);
      if (!body.includes("requireRead(c)")) fail(`Core route ${route} does not visibly require authenticated/internal read access`);
    }
  }
  if (coreIndex.includes("requireShellRead")) fail("Core still contains requireShellRead origin-based read bypass");
  pass("Runtime-first platform source scan completed");
}

function runCommand(args, label) {
  const result = spawnSync("pnpm", args, { cwd: root, encoding: "utf8" });
  if (result.status === 0) pass(label);
  else fail(`${label} failed\n${result.stdout}${result.stderr}`);
}

function testMigrationDrift() {
  if (!process.argv.includes("--check-migrations")) {
    note("Migration drift check skipped; run `pnpm test:generated -- --check-migrations` for Drizzle generate checks");
    return;
  }
  const packages = workspaceDirectories(root)
    .filter((directory) => fs.existsSync(path.join(directory, "drizzle.config.ts")))
    .map((directory) => readJson(path.join(directory, "package.json")).name)
    .filter(Boolean);
  const before = spawnSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }).stdout;
  for (const name of packages) runCommand(["--filter", name, "db:generate"], `Drizzle generate check for ${name}`);
  const after = spawnSync("git", ["status", "--short"], { cwd: root, encoding: "utf8" }).stdout;
  if (before !== after) fail("Drizzle generate changed the worktree; commit an incremental migration or update schema history");
}

async function testHttpScenarios() {
  const scenarioDir = path.join(root, "tests/scenarios");
  if (!fs.existsSync(scenarioDir)) return;
  const baseUrl = process.env.CORE_TEST_BASE_URL;
  const scenarioFiles = fs.readdirSync(scenarioDir).filter((file) => file.endsWith(".json")).sort();
  if (!baseUrl) {
    note(`HTTP scenario generation skipped for ${scenarioFiles.length} scenario file(s); set CORE_TEST_BASE_URL to run them`);
    return;
  }
  for (const file of scenarioFiles) {
    const scenario = readJson(path.join(scenarioDir, file));
    for (const request of scenario.requests ?? []) {
      const response = await fetch(`${baseUrl}${request.path}`, { method: request.method ?? "GET" });
      const expected = request.anonymous;
      if (response.status !== expected) fail(`${file}: ${request.method ?? "GET"} ${request.path} expected ${expected}, got ${response.status}`);
      else pass(`${file}: ${request.method ?? "GET"} ${request.path} -> ${expected}`);
    }
  }
}

console.log("Generated v2 tests");
console.log("==================");
const manifests = await discoverPluginManifests();
testManifestContracts(manifests);
testRuntimeFirstArchitecture();
testMigrationDrift();
await testHttpScenarios();
console.log("==================");
if (notes.length) console.log(`${notes.length} note(s), ${failures.length} failure(s)`);
if (failures.length) process.exit(1);
pass("Generated tests completed");
