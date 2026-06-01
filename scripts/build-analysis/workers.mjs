import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readJsonc, relativePath } from "./common.mjs";

const extractNumericFlag = (script, flag) => {
  const match = String(script || "").match(new RegExp(`(?:^|\\s)${flag}(?:=|\\s+)(\\d+)`));
  return match ? Number(match[1]) : null;
};

const parseSizeString = (value) => {
  const match = String(value || "").trim().match(/^([\d.]+)\s*(B|KiB|MiB|GiB|KB|MB|GB)$/i);
  if (!match) return 0;
  const size = Number(match[1]);
  if (!Number.isFinite(size)) return 0;
  const unit = match[2].toUpperCase();
  const factor = unit === "GIB" || unit === "GB" ? 1024 ** 3 : unit === "MIB" || unit === "MB" ? 1024 ** 2 : unit === "KIB" || unit === "KB" ? 1024 : 1;
  return Math.round(size * factor);
};

const measureWorkerSize = (root, config) => {
  const workerDir = path.dirname(config);
  const configName = path.basename(config);
  const result = spawnSync("pnpm", ["--dir", workerDir, "exec", "wrangler", "deploy", "--dry-run", "--config", configName], {
    cwd: root,
    env: { ...process.env, WRANGLER_LOG_PATH: "/tmp" },
    encoding: "utf8",
    shell: false,
  });
  const combined = `${result.stdout || ""}${result.stderr || ""}${result.error ? `\n${String(result.error.message || result.error)}` : ""}`;
  const match = combined.match(/Total Upload:\s*([0-9.]+\s*(?:B|KiB|MiB|GiB|KB|MB|GB))\s*\/\s*gzip:\s*([0-9.]+\s*(?:B|KiB|MiB|GiB|KB|MB|GB))/i);
  const firstErrorLine = combined
    .split(/\r?\n/)
    .map((line) => line.replace(/\u001b\[[0-9;]*m/g, "").trim())
    .find((line) => line.startsWith("✘ [ERROR]") || line.includes("Failed to fetch auth token") || line.includes("Error"));
  if (!match) {
    return { rawBytes: 0, gzipBytes: 0, ok: false, note: firstErrorLine || "wrangler dry-run did not return size line" };
  }
  return {
    rawBytes: parseSizeString(match[1]),
    gzipBytes: parseSizeString(match[2]),
    ok: true,
    note: "",
  };
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
    const size = measureWorkerSize(root, config);
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
      rawBytes: size.rawBytes,
      gzipBytes: size.gzipBytes,
      ok: size.ok,
      note: size.note,
    }];
  });
}
