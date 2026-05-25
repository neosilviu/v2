import fs from "node:fs";
import path from "node:path";
import { readJsonc, relativePath } from "./common.mjs";

const extractNumericFlag = (script, flag) => {
  const match = String(script || "").match(new RegExp(`(?:^|\\s)${flag}(?:=|\\s+)(\\d+)`));
  return match ? Number(match[1]) : null;
};

export function analyzeWorkers(root, packages) {
  return packages.flatMap((item) => {
    const config = path.join(root, item.directory, "wrangler.jsonc");
    if (!fs.existsSync(config)) return [];
    const parsed = readJsonc(config);
    const d1 = Array.isArray(parsed.d1_databases) ? parsed.d1_databases : [];
    const services = Array.isArray(parsed.services) ? parsed.services : [];
    const r2 = Array.isArray(parsed.r2_buckets) ? parsed.r2_buckets : [];
    const bindings = [
      ...d1.map((binding) => binding.binding),
      ...services.map((binding) => binding.binding),
      ...r2.map((binding) => binding.binding),
      parsed.ai?.binding,
    ].filter(Boolean);
    const devScript = item.scripts?.dev ?? "";
    return [{
      package: item.name,
      directory: item.directory,
      workerName: parsed.name ?? "",
      main: parsed.main ?? "",
      config: relativePath(root, config),
      bindings,
      d1: d1.map((binding) => ({ binding: binding.binding, database: binding.database_name })),
      services: services.map((binding) => ({ binding: binding.binding, service: binding.service })),
      r2: r2.map((binding) => ({ binding: binding.binding, bucket: binding.bucket_name })),
      hasAiBinding: Boolean(parsed.ai?.binding),
      devPort: extractNumericFlag(devScript, "--port"),
      inspectorPort: extractNumericFlag(devScript, "--inspector-port"),
    }];
  });
}
