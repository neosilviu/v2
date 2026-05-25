import fs from "node:fs";
import path from "node:path";

export const ignored = new Set(["node_modules", ".git", "dist", ".turbo", ".wrangler", "coverage", "reports"]);
export const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
export const measuredExtensions = new Set([...codeExtensions, ".css", ".json", ".sql"]);

export function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return entry.isFile() ? [absolute] : [];
  });
}

export const relativePath = (root, file) => path.relative(root, file).split(path.sep).join("/");
export const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  return `${value.toFixed(unit === 0 || value >= 10 ? 0 : 2)} ${units[unit]}`;
}
