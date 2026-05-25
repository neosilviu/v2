import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeBoundaries, readPackages } from "./build-analysis/boundaries.mjs";
import { analyzeSource } from "./build-analysis/source.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reports = path.join(root, "reports");
const strict = process.argv.includes("--strict");
fs.mkdirSync(reports, { recursive: true });

const packages = readPackages(root);
const source = analyzeSource(root);
const boundaries = analyzeBoundaries(root, packages);
const report = {
  generatedAt: new Date().toISOString(),
  mode: strict ? "strict" : "report",
  source,
  boundaries,
};
const historyFile = path.join(reports, "build-history.json");
let history = [];
if (fs.existsSync(historyFile)) {
  try { history = JSON.parse(fs.readFileSync(historyFile, "utf8")); } catch { history = []; }
}
history = [{ generatedAt: report.generatedAt, codeLines: source.codeLines, findings: boundaries.findings.length }, ...history].slice(0, 20);
fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
fs.writeFileSync(path.join(reports, "build-analysis-report.json"), JSON.stringify({ ...report, history }, null, 2));

const findings = boundaries.findings.map((finding) => `- ${finding.message} (${finding.location})`).join("\n") || "- none";
const areas = Object.entries(source.areas).map(([area, metric]) => `| ${area} | ${metric.codeFiles} | ${metric.codeLines} |`).join("\n");
const summary = `# v2 build analysis\n\n| Metric | Value |\n| --- | ---: |\n| Code files | ${source.codeFiles} |\n| Code lines | ${source.codeLines} |\n| Workspace packages | ${packages.length} |\n| Internal dependency edges | ${boundaries.edges.length} |\n| Platform/plugin findings | ${boundaries.findings.length} |\n\n## Platform/plugin findings\n\n${findings}\n\n## Source areas\n\n| Area | Code files | Code lines |\n| --- | ---: | ---: |\n${areas}\n`;
fs.writeFileSync(path.join(reports, "build-analysis-report.md"), summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
if (strict && boundaries.findings.length) process.exitCode = 1;
