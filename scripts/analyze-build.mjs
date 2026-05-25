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
  findings: boundaries.findings.length,
  bundleBytes: bundle.totalBytes,
  initialBundleBytes: bundle.initialBytes,
  workers: workers.length,
}, ...history].slice(0, 20);

fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
fs.writeFileSync(path.join(reports, "build-analysis-report.json"), JSON.stringify({ ...report, history }, null, 2));

const findings = boundaries.findings.map((item) => `- ${item.message} (${item.location})`).join("\n") || "- none";
const topAreas = Object.entries(source.areas).slice(0, 10).map(([area, value]) => `| ${area} | ${value.codeFiles} | ${value.codeLines} |`).join("\n");
const workerRows = workers.map((worker) => `| ${worker.package} | ${worker.workerName} | ${worker.devPort ?? "-"} | ${worker.inspectorPort ?? "-"} | ${worker.bindings.join(", ") || "-"} |`).join("\n") || "| none | - | - | - | - |";
const assetRows = (bundle.assets ?? []).slice(0, 10).map((asset) => `| ${asset.file} | ${formatBytes(asset.bytes)} |`).join("\n") || "| no web build found | 0 B |";
const formatInt = (value) => Number(value || 0).toLocaleString();
const pad = (label) => label.padEnd(28);
const workerLabel = (worker) => worker.directory.replace(/^apps\//, "app/").replace(/^plugins\//, "plugin/");
const workerLine = (worker) =>
  `  - ${workerLabel(worker).padEnd(24)} :${String(worker.devPort ?? "-").padEnd(5)} inspector :${String(worker.inspectorPort ?? "-").padEnd(5)} ${worker.bindings.join(", ") || "no bindings"}`;
const areaLine = ([area, value]) => `  - ${area.padEnd(24)} ${formatInt(value.codeLines).padStart(6)} LOC`;
const assetLine = (asset) => `  - ${asset.file.replace(/^apps\/web\/dist\//, "").padEnd(42)} ${formatBytes(asset.bytes)}`;

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
${topAreas}

## Worker dev surfaces
| Package | Worker | Port | Inspector | Bindings |
| --- | --- | ---: | ---: | --- |
${workerRows}

## Largest web assets
| Asset | Size |
| --- | ---: |
${assetRows}

## Findings
${findings}
`;

fs.writeFileSync(path.join(reports, "build-analysis-report.md"), summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

console.log("");
console.log("========================================");
console.log("V2 BUILD ANALYZE");
console.log("========================================");
console.log(`${pad("Packages")} ${packages.length}`);
console.log(`${pad("Deployable workers")} ${workers.length}`);
console.log(`${pad("Boundary findings")} ${boundaries.findings.length}`);
console.log(`${pad("Code")} ${formatInt(source.codeLines)} LOC`);
console.log("----------------------------------------");
console.log(`${pad("Web initial")} ${formatBytes(bundle.initialBytes)}`);
console.log(`${pad("Web total")} ${formatBytes(bundle.totalBytes)}`);
console.log(`${pad("Initial JS gzip")} ${formatBytes(bundle.initialGzipScriptsBytes)}`);
console.log(`${pad("Initial JS brotli")} ${formatBytes(bundle.initialBrotliScriptsBytes)}`);
console.log(`${pad("All JS gzip")} ${formatBytes(bundle.gzipScriptsBytes)}`);
console.log("----------------------------------------");
console.log("Workers");
console.log((workers.map(workerLine).join("\n")) || "  none");
console.log("----------------------------------------");
console.log("Largest source areas");
console.log(Object.entries(source.areas).slice(0, 8).map(areaLine).join("\n"));
console.log("----------------------------------------");
console.log("Largest web assets");
console.log(((bundle.assets ?? []).slice(0, 5).map(assetLine).join("\n")) || "  no web build found");
console.log("----------------------------------------");
if (boundaries.findings.length > 0) {
  console.log(`Architecture findings: ${boundaries.findings.length}`);
  for (const item of boundaries.findings.slice(0, 6)) console.log(`  - ${item.location}: ${item.message}`);
  if (boundaries.findings.length > 6) console.log(`  ... ${boundaries.findings.length - 6} more in reports/build-analysis-report.md`);
} else {
  console.log("Architecture findings: none");
}
console.log("----------------------------------------");
console.log("Reports");
console.log("  - reports/build-analysis-report.md");
console.log("  - reports/build-analysis-report.json");
console.log("");
if (strict && boundaries.findings.length) process.exitCode = 1;
