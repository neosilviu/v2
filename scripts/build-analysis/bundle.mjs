import fs from "node:fs";
import path from "node:path";

function visit(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? visit(file) : [file];
  });
}

export function analyzeBundle(root) {
  const directory = path.join(root, "apps", "web", "dist");
  if (!fs.existsSync(directory)) return { available: false, totalBytes: 0, scriptsBytes: 0, stylesBytes: 0, assets: [] };
  const assets = visit(directory).map((file) => ({
    file: path.relative(root, file).split(path.sep).join("/"),
    bytes: fs.statSync(file).size,
  })).sort((left, right) => right.bytes - left.bytes);
  return {
    available: true,
    totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    scriptsBytes: assets.filter((asset) => asset.file.endsWith(".js")).reduce((sum, asset) => sum + asset.bytes, 0),
    stylesBytes: assets.filter((asset) => asset.file.endsWith(".css")).reduce((sum, asset) => sum + asset.bytes, 0),
    assets: assets.slice(0, 15),
  };
}
