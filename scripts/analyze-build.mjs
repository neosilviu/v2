import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reports = path.join(root, "reports");
fs.mkdirSync(reports, { recursive: true });
const report = {
  generatedAt: new Date().toISOString(),
  status: "foundation",
  note: "Build analysis modules are being introduced incrementally.",
};
fs.writeFileSync(path.join(reports, "build-analysis-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
