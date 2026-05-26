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
  const globalIds = { tools: new Map(), providers: new Map(), surfaces: new Map(), publicRoutes: new Map(), publicSurfaces: new Map(), publicTools: new Map(), settingsTabs: new Map(), settingsPanels: new Map() };
  for (const item of manifests) {
    const owner = `${relativePath(root, item.file)}#${item.exportName}`;
    const contributions = item.manifest.contributes;
    assertUnique(contributions.tools, "tool", owner);
    assertUnique(contributions.providers, "provider", owner);
    assertUnique(contributions.surfaces, "surface", owner);
    assertUnique(contributions.settingsTabs, "settings tab", owner);
    assertUnique(contributions.settingsPanels, "settings panel", owner);
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
      settingsTabs: contributions.settingsTabs,
      settingsPanels: contributions.settingsPanels,
    })) {
      for (const contribution of collection) {
        if (globalIds[group].has(contribution.id)) fail(`${group} id '${contribution.id}' is duplicated across ${owner} and ${globalIds[group].get(contribution.id)}`);
        else globalIds[group].set(contribution.id, owner);
      }
    }
    const surfaceIds = new Set(contributions.surfaces.map((surface) => surface.id));
    const toolIds = new Set(contributions.tools.map((tool) => tool.id));
    const settingsTabIds = new Set(contributions.settingsTabs.map((tab) => tab.id));
    const settingsPanelIds = new Set(contributions.settingsPanels.map((panel) => panel.id));
    for (const tab of contributions.settingsTabs) {
      if (!settingsPanelIds.has(tab.panelContributionId)) fail(`settings tab '${tab.id}' in ${owner} references missing panel '${tab.panelContributionId}'`);
    }
    for (const panel of contributions.settingsPanels) {
      if (!settingsTabIds.has(panel.tabId)) fail(`settings panel '${panel.id}' in ${owner} references missing tab '${panel.tabId}'`);
    }
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
  const coreEnv = fs.readFileSync(path.join(root, "apps/core-worker/src/env.ts"), "utf8");
  const coreWrangler = fs.readFileSync(path.join(root, "apps/core-worker/wrangler.jsonc"), "utf8");
  for (const route of ["/runtime/plugins", "/runtime/tools", "/runtime/providers", "/plugins/installed", "/workspaces/:workspaceId/plugins", "/workspaces/:workspaceId/settings/:scope", "/workspaces/:workspaceId/layout"]) {
    const routePosition = coreIndex.indexOf(`app.get("${route}"`);
    if (routePosition < 0) fail(`Core route ${route} is missing from static auth matrix`);
    else {
      const body = coreIndex.slice(routePosition, routePosition + 360);
      if (!body.includes("requireRead(c)") && !body.includes("requirePermission(c")) fail(`Core route ${route} does not visibly require authenticated/internal read access`);
    }
  }
  if (coreIndex.includes("requireShellRead")) fail("Core still contains requireShellRead origin-based read bypass");
  for (const forbidden of ["WEBSITE_RUNTIME", "websiteStudioDispatch", "website.listPages", "website.publishPage", "website.updateSection", "website.installDemoData", "website.readPageContext"]) {
    if (coreIndex.includes(forbidden) || coreEnv.includes(forbidden) || coreWrangler.includes(forbidden)) fail(`Core contains feature-specific runtime dispatch artifact '${forbidden}'`);
  }
  if (!coreEnv.includes("PLUGIN_RUNTIME") || !coreIndex.includes("pluginRuntimeDispatch")) fail("Core is missing the generic plugin runtime dispatch boundary");
  if (!coreIndex.includes("runtimeKey")) fail("Core does not pass a persisted runtimeKey to plugin runtime dispatch");
  for (const route of ["/workspaces/:workspaceId/settings/tabs", "/workspaces/:workspaceId/settings/tabs/:tabId", "/workspaces/:workspaceId/settings/runtime/data", "/workspaces/:workspaceId/settings/runtime/actions"]) {
    if (!coreIndex.includes(route)) fail(`Core runtime Settings route ${route} is missing`);
  }
  const uiSchema = fs.readFileSync(path.join(root, "packages/ui-schema/src/index.ts"), "utf8");
  for (const symbol of ["settingsTabContributionSchema", "settingsPanelContributionSchema", "platformSettingsTabIds"]) {
    if (!uiSchema.includes(symbol)) fail(`@v2/ui-schema is missing ${symbol}`);
  }
  const pluginContracts = fs.readFileSync(path.join(root, "packages/plugin-contracts/src/index.ts"), "utf8");
  if (!pluginContracts.includes("settingsTabs") || !pluginContracts.includes("settingsPanels")) fail("@v2/plugin-contracts does not expose settings tab/panel manifest contributions");
  const webApp = fs.readFileSync(path.join(root, "apps/web/src/App.tsx"), "utf8");
  if (!webApp.includes("SettingsPage")) fail("Web App does not route Settings through the runtime SettingsPage");
  pass("Runtime-first platform source scan completed");
}

function testPlatformSeparationGuards() {
  const runtimeBridge = fs.readFileSync(path.join(root, "apps/runtime-bridge/src/index.ts"), "utf8");
  const runtimeBridgeEnv = fs.readFileSync(path.join(root, "apps/runtime-bridge/src/env.ts"), "utf8");
  const runtimeBridgeWrangler = fs.readFileSync(path.join(root, "apps/runtime-bridge/wrangler.jsonc"), "utf8");
  for (const forbidden of ["WEBSITE_STUDIO", "PLUGIN_RUNTIME_BINDINGS", "website-studio", "v2-plugin-website-studio", "PROVIDER_RUNTIME", "/mcp"]) {
    if (runtimeBridge.includes(forbidden) || runtimeBridgeEnv.includes(forbidden) || runtimeBridgeWrangler.includes(forbidden)) fail(`Runtime Bridge contains forbidden static runtime/MCP artifact '${forbidden}'`);
  }
  if (!runtimeBridgeWrangler.includes("dispatch_namespaces") || !runtimeBridgeWrangler.includes("\"DISPATCHER\"")) fail("Runtime Bridge is not configured with a Dispatch Namespace binding");
  if (!runtimeBridge.includes("DISPATCHER?.get(runtimeKey)")) fail("Runtime Bridge does not dispatch through env.DISPATCHER.get(runtimeKey)");

  const mcpGateway = fs.readFileSync(path.join(root, "apps/mcp-gateway/src/index.ts"), "utf8");
  const mcpWrangler = fs.readFileSync(path.join(root, "apps/mcp-gateway/wrangler.jsonc"), "utf8");
  if (!mcpGateway.includes('app.post("/mcp"')) fail("MCP Gateway does not own the /mcp endpoint");
  for (const forbidden of ["WEBSITE_STUDIO", "PROVIDER_RUNTIME", "v2-plugin-website-studio", "v2-plugin-ai-providers"]) {
    if (mcpGateway.includes(forbidden) || mcpWrangler.includes(forbidden)) fail(`MCP Gateway contains forbidden plugin binding '${forbidden}'`);
  }

  const agentWrangler = fs.readFileSync(path.join(root, "plugins/agent-ai/wrangler.jsonc"), "utf8");
  const agentSource = fs.readFileSync(path.join(root, "plugins/agent-ai/server/worker.ts"), "utf8") + fs.readFileSync(path.join(root, "plugins/agent-ai/server/provider-routes.ts"), "utf8");
  if (agentWrangler.includes("PROVIDER_RUNTIME") || agentWrangler.includes("v2-plugin-ai-providers") || agentSource.includes("PROVIDER_RUNTIME")) fail("Agent AI still depends directly on the AI Providers plugin runtime");

  const provisioner = fs.readFileSync(path.join(root, "apps/platform-provisioner-worker/src/index.ts"), "utf8");
  const cloudflarePackage = fs.readFileSync(path.join(root, "packages/cloudflare-platform/src/dispatch-namespace.ts"), "utf8");
  const coreEnv = fs.readFileSync(path.join(root, "apps/core-worker/src/env.ts"), "utf8");
  if (!provisioner.includes("CLOUDFLARE_API_TOKEN") || !coreEnv.includes("PLATFORM_PROVISIONER")) fail("Cloudflare provisioning boundary is not split between Core and provisioner");
  if (coreEnv.includes("CLOUDFLARE_API_TOKEN")) fail("Core environment exposes the Cloudflare API token");
  if (!cloudflarePackage.includes("putDispatchWorker")) fail("@v2/cloudflare-platform does not expose Dispatch Namespace worker deployment helpers");

  const webWrangler = fs.readFileSync(path.join(root, "apps/web/wrangler.jsonc"), "utf8");
  const webPackage = fs.readFileSync(path.join(root, "apps/web/package.json"), "utf8");
  const webRedirects = fs.readFileSync(path.join(root, "apps/web/public/_redirects"), "utf8");
  if (!webWrangler.includes("pages_build_output_dir") || webWrangler.includes("\"assets\"") || webWrangler.includes("\"main\"")) fail("Web app must deploy as Cloudflare Pages, not a Worker Static Assets app");
  if (!webWrangler.includes("pnpm --filter @v2/web build") || !webWrangler.includes("apps/web/dist")) fail("Web Pages config does not record the required Pages build command and output directory");
  if (!webPackage.includes("wrangler pages deploy dist --project-name v2-web")) fail("Web package does not expose a Cloudflare Pages deploy command");
  for (const route of ["/login", "/setup/owner", "/settings", "/public/*"]) {
    if (!webRedirects.includes(`${route} /index.html 200`)) fail(`Web Pages SPA fallback is missing ${route}`);
  }
	  if (!webWrangler.includes("VITE_CORE_API_URL") || !webWrangler.includes("VITE_AUTH_API_URL")) fail("Web Pages config is missing public Core/Auth API variables");
	  if (webWrangler.includes("example.invalid")) fail("Web Pages config must not commit fake preview/production API URLs");
	  pass("Platform/plugin separation guards completed");
	}

function runCommand(args, label) {
  const result = spawnSync("pnpm", args, { cwd: root, encoding: "utf8" });
  if (result.status === 0) pass(label);
  else fail(`${label} failed\n${result.stdout}${result.stderr}`);
}

function testAuthRuntimeBootstrapPolicy() {
  const source = fs.readFileSync(path.join(root, "apps/auth-worker/src/runtime-config.ts"), "utf8");
  if (source.includes("UPDATE auth_methods SET status = 'draft'")) fail("Auth runtime bootstrap still resets published passkey/social methods");
  for (const expected of ["VALUES ('password'", "VALUES ('passkey'", "VALUES ('social.github'"]) {
    if (!source.includes("INSERT OR IGNORE INTO auth_methods") || !source.includes(expected)) fail(`Auth runtime bootstrap is missing seed-only default ${expected}`);
  }
  pass("Auth runtime bootstrap is seed-only and does not reset published passkey/social methods");
}

function testNoImplicitWorkspaceOwnerBootstrap() {
  const repoSource = fs.readFileSync(path.join(root, "apps/core-worker/src/repository.ts"), "utf8");
  const hasPermissionBody = repoSource.match(/async hasPermission[\s\S]*?\n  \}/)?.[0] ?? "";
  const memberSummaryBody = repoSource.match(/async memberSummary[\s\S]*?\n  \}/)?.[0] ?? "";
  if (hasPermissionBody.includes("bootstrapOwner(")) fail("CoreRepository.hasPermission still bootstraps an owner as a permission-check side effect");
  if (memberSummaryBody.includes("bootstrapOwner(")) fail("CoreRepository.memberSummary still bootstraps an owner as a read side effect");
  const coreIndex = fs.readFileSync(path.join(root, "apps/core-worker/src/index.ts"), "utf8");
  if (coreIndex.includes("await repo.bootstrapOwner")) fail("Core routes still bootstrap owner from normal request authorization");
  pass("Workspace owner bootstrap is explicit and not a permission side effect");
}

function testReadRoutesDoNotSeedPlatformSettings() {
  const repoSource = fs.readFileSync(path.join(root, "apps/core-worker/src/repository.ts"), "utf8");
  for (const method of ["workspaceInstalled", "activePlugins", "workspacePlugins", "settingsTabs"]) {
    const body = repoSource.match(new RegExp(`async ${method}\\\\([^)]*\\\\)[\\\\s\\\\S]*?\\\\n  \\\\}`))?.[0] ?? "";
    if (body.includes("ensurePlatformSettingsContributions(") || body.includes("ensureWorkspace(")) fail(`CoreRepository.${method} still performs mutating platform/workspace seeding in a read path`);
  }
  const webApi = fs.readFileSync(path.join(root, "apps/web/src/api.ts"), "utf8");
  if (webApi.includes('const workspaceId = "default"')) fail("Web API still hardcodes workspaceId = \"default\"");
  if (!webApi.includes('headers.delete("content-type")')) fail("Web API does not strip JSON Content-Type from GET/HEAD requests");
  pass("Core/Web read paths avoid implicit D1 writes and unnecessary GET preflight headers");
}

function testProductionRuntimeHardening() {
  const coreIndex = fs.readFileSync(path.join(root, "apps/core-worker/src/index.ts"), "utf8");
  const repoSource = fs.readFileSync(path.join(root, "apps/core-worker/src/repository.ts"), "utf8");
  const authSource = fs.readFileSync(path.join(root, "apps/auth-worker/src/auth.ts"), "utf8");
  const authIndex = fs.readFileSync(path.join(root, "apps/auth-worker/src/index.ts"), "utf8");
  const websiteWorker = fs.readFileSync(path.join(root, "plugins/website-studio/server/worker.ts"), "utf8");
  const mailContracts = fs.readFileSync(path.join(root, "packages/mail-contracts/src/index.ts"), "utf8");

  if (!mailContracts.includes("transactional-http")) fail("Core Mail contracts do not expose a Worker-compatible transactional-http provider");
  if (repoSource.includes("provider.kind === \"mock-development-only\" || smtpReady")) fail("CoreRepository.sendMail still marks SMTP as sent from safe config flags");
  if (!repoSource.includes("Mail provider response did not confirm delivery acceptance")) fail("Core Mail delivery does not require provider confirmation before sent");
  if (!authSource.includes("sendVerificationEmail") || !authSource.includes("sendResetPassword") || !authSource.includes("core.internal/internal/workspaces")) fail("Better Auth verification/reset are not routed through Core Mail Runtime");
  if (!authIndex.includes("/setup/owner/sign-up/email") || !coreIndex.includes("/internal/setup/owner/consume")) fail("First owner setup does not expose a dedicated token-authorized signup/finalization flow");

  for (const route of ["/runtime/plugins", "/runtime/tools", "/runtime/providers", "/plugins/installed", "/workspaces/:workspaceId/plugins", "/workspaces/:workspaceId/ui/surfaces"]) {
    const routePosition = coreIndex.indexOf(`app.get("${route}"`);
    const body = routePosition >= 0 ? coreIndex.slice(routePosition, routePosition + 520) : "";
    if (!body.includes("requirePermission(c")) fail(`Core private route ${route} does not visibly enforce workspace RBAC`);
  }
  for (const route of ["/tools/execute", "/runtime/ui/data", "/runtime/ui/actions"]) {
    const routePosition = coreIndex.indexOf(`app.post("${route}"`);
    const body = routePosition >= 0 ? coreIndex.slice(routePosition, routePosition + 1400) : "";
    if (!body.includes("requireAllPermissions(c") && !body.includes("requirePermission(c")) fail(`Core private route ${route} does not visibly enforce user permissions`);
  }
  if (!coreIndex.includes("verifyDnsDomain") || !coreIndex.includes("cloudflare-dns.com/dns-query") || coreIndex.includes("input.status !== \"draft\" && input.status !== \"verifying\" && input.status !== \"verified\"")) fail("Domain verification can still bypass DNS verification");
  if (!websiteWorker.includes("plugin-runtime.internal") || !websiteWorker.includes("not_authorized")) fail("Website Studio worker is not restricted to the internal runtime binding");
	  if (coreIndex.includes("websiteStudioDispatch") || coreIndex.includes("WEBSITE_RUNTIME") || coreIndex.includes("website.publishPage")) fail("Core contains Website Studio feature-specific dispatch");
	  if (coreIndex.includes("if (c.get(\"internal\")) return undefined")) fail("Delegated internal user calls can bypass Core RBAC");
	  if (!coreIndex.includes("PLATFORM_PROVISIONER") || !coreIndex.includes("plugin.runtime.provisioning") || !coreIndex.includes("runtimeStatus: \"deployed\"")) fail("Plugin installation does not visibly provision runtime before activation");
	  if (repoSource.includes("runtimeKey: pluginId") || repoSource.includes("runtimeStatus: \"active\", deploymentId: null")) fail("CoreRepository still creates fake active plugin runtimes");
	  if (!repoSource.includes("publicSurfaceId(contribution)") || repoSource.includes("?.commandId ?? null")) fail("Runtime surfaces may still derive requiredPermission from command ids");
	  if (!coreIndex.includes("approvals.release") || !coreIndex.includes("approvals.consume") || coreIndex.indexOf("approvals.consume") < coreIndex.indexOf("pluginRuntimeDispatch")) fail("Tool approvals are not visibly released/consumed around confirmed runtime execution");
	  if (!coreIndex.includes("public.runtime.ui.data.execute") || !coreIndex.includes("public.runtime.ui.action.execute")) fail("Public runtime data/actions do not dispatch through the generic runtime bridge");
	  pass("Production runtime hardening source scan completed");
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
testPlatformSeparationGuards();
testAuthRuntimeBootstrapPolicy();
testNoImplicitWorkspaceOwnerBootstrap();
testReadRoutesDoNotSeedPlatformSettings();
testProductionRuntimeHardening();
testMigrationDrift();
await testHttpScenarios();
console.log("==================");
if (notes.length) console.log(`${notes.length} note(s), ${failures.length} failure(s)`);
if (failures.length) process.exit(1);
pass("Generated tests completed");
