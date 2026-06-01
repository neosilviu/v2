import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeBoundaries, readPackages } from "./build-analysis/boundaries.mjs";
import { analyzeBundle } from "./build-analysis/bundle.mjs";
import { formatBytes } from "./build-analysis/common.mjs";
import { analyzeSource } from "./build-analysis/source.mjs";
import { analyzeWorkers } from "./build-analysis/workers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reports = path.join(root, "reports");
const strict = process.argv.includes("--strict");

fs.mkdirSync(reports, { recursive: true });

const packages = readPackages(root);
const source = analyzeSource(root);
const boundaries = analyzeBoundaries(root, packages);
const bundle = analyzeBundle(root);
const workers = analyzeWorkers(root, packages);
const report = { generatedAt: new Date().toISOString(), mode: strict ? "strict" : "report", source, boundaries, bundle, workers };

const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
};
const color = (text, code) => `${code}${text}${ANSI.reset}`;
const green = (text) => color(text, ANSI.green);
const yellow = (text) => color(text, ANSI.yellow);
const cyan = (text) => color(text, ANSI.cyan);
const dim = (text) => color(text, ANSI.dim);

const historyFile = path.join(reports, "build-history.json");
let history = [];
if (fs.existsSync(historyFile)) {
  try {
    history = JSON.parse(fs.readFileSync(historyFile, "utf8"));
  } catch {
    history = [];
  }
}

history = [{
  generatedAt: report.generatedAt,
  codeLines: source.codeLines,
  totalLines: source.totalLines,
  findings: boundaries.findings.length,
  coreBytes: workers.filter((worker) => worker.package.includes("core-worker")).reduce((sum, worker) => sum + Number(worker.rawBytes || 0), 0),
  coreGzipBytes: workers.filter((worker) => worker.package.includes("core-worker")).reduce((sum, worker) => sum + Number(worker.gzipBytes || 0), 0),
  authBytes: workers.filter((worker) => worker.package.includes("auth-worker")).reduce((sum, worker) => sum + Number(worker.rawBytes || 0), 0),
  authGzipBytes: workers.filter((worker) => worker.package.includes("auth-worker")).reduce((sum, worker) => sum + Number(worker.gzipBytes || 0), 0),
  pluginWorkersBytes: workers.filter((worker) => worker.package.startsWith("@v2/plugin-")).reduce((sum, worker) => sum + Number(worker.rawBytes || 0), 0),
  pluginWorkersGzipBytes: workers.filter((worker) => worker.package.startsWith("@v2/plugin-")).reduce((sum, worker) => sum + Number(worker.gzipBytes || 0), 0),
  frontendBytes: bundle.totalBytes,
  frontendGzipBytes: bundle.gzipScriptsBytes,
  coreLoc: source.areas["apps/core-worker"]?.codeLines ?? 0,
  authLoc: source.areas["apps/auth-worker"]?.codeLines ?? 0,
  frontendLoc: source.areas["apps/web"]?.codeLines ?? 0,
  sharedLoc: Object.entries(source.areas).filter(([area]) => area.startsWith("packages/")).reduce((sum, [, value]) => sum + Number(value.codeLines || 0), 0),
  scriptsLoc: source.areas.scripts?.codeLines ?? 0,
  codePlugins: Object.fromEntries(Object.entries(source.areas).filter(([area]) => area.startsWith("plugins/")).map(([area, value]) => [area, Number(value.codeLines || 0)])),
}, ...history].slice(0, 20);

fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
fs.writeFileSync(path.join(reports, "build-analysis-report.json"), JSON.stringify({ ...report, history }, null, 2));

const formatInt = (value) => Number(value || 0).toLocaleString();
const pad = (label) => label.padEnd(28);
const summary = `# v2 build analysis

| Metric | Value |
| --- | ---: |
| Code lines | ${source.codeLines} |
| Packages | ${packages.length} |
| Boundary findings | ${boundaries.findings.length} |
| Web initial output | ${formatBytes(bundle.initialBytes)} |
| Web output | ${formatBytes(bundle.totalBytes)} |
| Web initial JS gzip | ${formatBytes(bundle.initialGzipScriptsBytes)} |
| Web JS gzip | ${formatBytes(bundle.gzipScriptsBytes)} |
| Web JS brotli | ${formatBytes(bundle.brotliScriptsBytes)} |
| Deployable apps | ${workers.length} |

## Largest source areas
| Area | Files | Code lines |
| --- | ---: | ---: |
${Object.entries(source.areas).slice(0, 10).map(([area, value]) => `| ${area} | ${value.files} | ${value.codeLines} |`).join("\n")}

## Worker dev surfaces
| Package | Worker | Port | Inspector | Bindings |
| --- | --- | ---: | ---: | --- |
${workers.map((worker) => `| ${worker.package} | ${worker.workerName} | ${worker.devPort ?? "-"} | ${worker.inspectorPort ?? "-"} | ${worker.bindings.join(", ") || "-"} |`).join("\n")}

## Largest web assets
| Asset | Size |
| --- | ---: |
${(bundle.assets ?? []).slice(0, 10).map((asset) => `| ${asset.file} | ${formatBytes(asset.bytes)} |`).join("\n")}

## Findings
${boundaries.findings.map((item) => `- ${item.message} (${item.location})`).join("\n") || "- none"}
`;

fs.writeFileSync(path.join(reports, "build-analysis-report.md"), summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

const pluginWorkers = workers.filter((worker) => worker.package.startsWith("@v2/plugin-"));
const pluginAreas = Object.entries(source.areas).filter(([area]) => area.startsWith("plugins/"));
const historySizeLine = (entry) => `  ${String(entry.generatedAt || "").replace("T", " ").replace("Z", "")} | core ${formatBytes(Number(entry.coreBytes || 0)).padStart(8)} | auth ${formatBytes(Number(entry.authBytes || 0)).padStart(8)} | plugins ${formatBytes(Number(entry.pluginWorkersBytes || 0)).padStart(8)} | frontend ${formatBytes(Number(entry.frontendBytes || 0)).padStart(8)}`;
const historySizeLineGzip = (entry) => `  ${String(entry.generatedAt || "").replace("T", " ").replace("Z", "")} | core ${formatBytes(Number(entry.coreGzipBytes || 0)).padStart(8)} | auth ${formatBytes(Number(entry.authGzipBytes || 0)).padStart(8)} | plugins ${formatBytes(Number(entry.pluginWorkersGzipBytes || 0)).padStart(8)} | frontend ${formatBytes(Number(entry.frontendGzipBytes || 0)).padStart(8)}`;
const historyCodeLine = (entry) => `  ${String(entry.generatedAt || "").replace("T", " ").replace("Z", "")} | code ${formatInt(Number(entry.codeLines || 0)).padStart(8)} | tracked ${formatInt(Number(entry.totalLines || 0)).padStart(8)}`;

console.log("\n========================================");
console.log("V2 BUILD ANALYZE");
console.log("========================================");
console.log(`${green("Core Workers CF raw").padEnd(24)} ${formatBytes(workers.filter((worker) => worker.package.includes("core-worker")).reduce((sum, worker) => sum + Number(worker.rawBytes || 0), 0))}`);
console.log(`${green("Core Workers CF gzip").padEnd(24)} ${formatBytes(workers.filter((worker) => worker.package.includes("core-worker")).reduce((sum, worker) => sum + Number(worker.gzipBytes || 0), 0))}`);
console.log(`${green("Auth Workers CF raw").padEnd(24)} ${formatBytes(workers.filter((worker) => worker.package.includes("auth-worker")).reduce((sum, worker) => sum + Number(worker.rawBytes || 0), 0))}`);
console.log(`${green("Auth Workers CF gzip").padEnd(24)} ${formatBytes(workers.filter((worker) => worker.package.includes("auth-worker")).reduce((sum, worker) => sum + Number(worker.gzipBytes || 0), 0))}`);
console.log(`${green("Plugin Workers CF raw").padEnd(24)} ${formatBytes(workers.filter((worker) => worker.package.startsWith("@v2/plugin-")).reduce((sum, worker) => sum + Number(worker.rawBytes || 0), 0))}`);
console.log(`${green("Plugin Workers CF gzip").padEnd(24)} ${formatBytes(workers.filter((worker) => worker.package.startsWith("@v2/plugin-")).reduce((sum, worker) => sum + Number(worker.gzipBytes || 0), 0))}`);
for (const worker of pluginWorkers) {
  console.log(`${cyan(`  - ${worker.package.replace(/^@v2\//, "")}`.padEnd(24))} ${formatBytes(Number(worker.rawBytes || 0))} / ${formatBytes(Number(worker.gzipBytes || 0))}`);
}
console.log(`${yellow("Frontend (initial)").padEnd(24)} ${formatBytes(bundle.initialBytes)}`);
console.log(`${yellow("Frontend (total)").padEnd(24)} ${formatBytes(bundle.totalBytes)}`);
console.log(`${cyan("Total").padEnd(24)} ${formatBytes(bundle.totalBytes + workers.reduce((sum, worker) => sum + Number(worker.rawBytes || 0), 0))}`);
if (history.length > 0) {
  console.log("\nRecent size history:");
  for (const entry of history) console.log(historySizeLine(entry));
  console.log(dim("                      raw -> gzip"));
  for (const entry of history) console.log(historySizeLineGzip(entry));
}
console.log("----------------------------------------");
const codeLocHistory = history.map((entry) => Number(entry.codeLines || 0)).filter((value) => Number.isFinite(value) && value > 0).map((value) => formatInt(value)).join(" | ");
const trackedLocHistory = history.map((entry) => Number(entry.totalLines || 0)).filter((value) => Number.isFinite(value) && value > 0).map((value) => formatInt(value)).join(" | ");
const coreLocHistory = history.map((entry) => Number(entry.coreLoc || 0)).filter((value) => Number.isFinite(value) && value > 0).map((value) => formatInt(value)).join(" | ");
const authLocHistory = history.map((entry) => Number(entry.authLoc || 0)).filter((value) => Number.isFinite(value) && value > 0).map((value) => formatInt(value)).join(" | ");
const frontendLocHistory = history.map((entry) => Number(entry.frontendLoc || 0)).filter((value) => Number.isFinite(value) && value > 0).map((value) => formatInt(value)).join(" | ");
const sharedLocHistory = history.map((entry) => Number(entry.sharedLoc || 0)).filter((value) => Number.isFinite(value) && value > 0).map((value) => formatInt(value)).join(" | ");
const scriptsLocHistory = history.map((entry) => Number(entry.scriptsLoc || 0)).filter((value) => Number.isFinite(value) && value > 0).map((value) => formatInt(value)).join(" | ");
console.log(`${green("Code LOC").padEnd(24)} ${formatInt(source.codeLines)}${codeLocHistory ? ` | ${codeLocHistory}` : ""}`);
console.log(`${dim("Tracked LOC").padEnd(24)} ${formatInt(source.totalLines)}${trackedLocHistory ? ` | ${trackedLocHistory}` : ""} ${dim("(code + css/json/config)")}`);
console.log(`${green("Core LOC").padEnd(24)} ${formatInt(source.areas["apps/core-worker"]?.codeLines ?? 0)}${coreLocHistory ? ` | ${coreLocHistory}` : ""}${(source.areas["apps/core-worker"]?.lines ?? 0) !== (source.areas["apps/core-worker"]?.codeLines ?? 0) ? ` ${dim(`tracked ${formatInt(source.areas["apps/core-worker"]?.lines ?? 0)}`)}` : ""}`);
console.log(`${green("Auth LOC").padEnd(24)} ${formatInt(source.areas["apps/auth-worker"]?.codeLines ?? 0)}${authLocHistory ? ` | ${authLocHistory}` : ""}${(source.areas["apps/auth-worker"]?.lines ?? 0) !== (source.areas["apps/auth-worker"]?.codeLines ?? 0) ? ` ${dim(`tracked ${formatInt(source.areas["apps/auth-worker"]?.lines ?? 0)}`)}` : ""}`);
console.log(`${yellow("Frontend LOC").padEnd(24)} ${formatInt(source.areas["apps/web"]?.codeLines ?? 0)}${frontendLocHistory ? ` | ${frontendLocHistory}` : ""}${(source.areas["apps/web"]?.lines ?? 0) !== (source.areas["apps/web"]?.codeLines ?? 0) ? ` ${dim(`tracked ${formatInt(source.areas["apps/web"]?.lines ?? 0)}`)}` : ""}`);
console.log(`${cyan("Shared LOC").padEnd(24)} ${formatInt(Object.entries(source.areas).filter(([area]) => area.startsWith("packages/")).reduce((sum, [, value]) => sum + Number(value.codeLines || 0), 0))}${sharedLocHistory ? ` | ${sharedLocHistory}` : ""}`);
console.log(`${cyan("Scripts LOC").padEnd(24)} ${formatInt(source.areas.scripts?.codeLines ?? 0)}${scriptsLocHistory ? ` | ${scriptsLocHistory}` : ""}${(source.areas.scripts?.lines ?? 0) !== (source.areas.scripts?.codeLines ?? 0) ? ` ${dim(`tracked ${formatInt(source.areas.scripts?.lines ?? 0)}`)}` : ""}`);
if (pluginAreas.length > 0) {
  console.log("Plugins LOC:");
  for (const [area, value] of pluginAreas) {
    const pluginLocHistory = history.map((entry) => Number(entry.codePlugins?.[area] || 0)).filter((item) => Number.isFinite(item) && item > 0).map((item) => formatInt(item)).join(" | ");
    const trackedLoc = Number(value.lines || 0);
    console.log(`${cyan(`  - ${area.replace("plugins/", "")}`.padEnd(24))} ${formatInt(Number(value.codeLines || 0))}${pluginLocHistory ? ` | ${pluginLocHistory}` : ""}${trackedLoc !== Number(value.codeLines || 0) ? ` ${dim(`tracked ${formatInt(trackedLoc)}`)}` : ""}`);
  }
}
console.log("----------------------------------------");
console.log(`${yellow("Initial JS gzip").padEnd(24)} ${formatBytes(bundle.initialGzipScriptsBytes)}`);
console.log(`${yellow("Initial JS brotli").padEnd(24)} ${formatBytes(bundle.initialBrotliScriptsBytes)}`);
console.log(`${yellow("Initial CSS").padEnd(24)} ${formatBytes(bundle.initialStylesBytes)}`);
console.log(`${yellow("Frontend JS gzip").padEnd(24)} ${formatBytes(bundle.gzipScriptsBytes)}`);
console.log(`${yellow("Frontend JS brotli").padEnd(24)} ${formatBytes(bundle.brotliScriptsBytes)}`);

console.log("\nTop frontend assets:");
(bundle.assets ?? []).slice(0, 10).forEach((asset, index) => {
  console.log(`  ${String(index + 1).padStart(2)}. ${formatBytes(asset.bytes).padStart(8)}  ${asset.file}`);
});

console.log(`\nJSON report: ${path.join(reports, "build-analysis-report.json")}`);
console.log(`History:     ${historyFile}`);
if (strict && boundaries.findings.length) process.exitCode = 1;
