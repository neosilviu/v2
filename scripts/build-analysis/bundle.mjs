import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function visit(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? visit(file) : [file];
  });
}

export function analyzeBundle(root) {
  const directory = path.join(root, "apps", "web", "dist");
  if (!fs.existsSync(directory)) {
    return { available: false, totalBytes: 0, scriptsBytes: 0, stylesBytes: 0, gzipScriptsBytes: 0, brotliScriptsBytes: 0, assets: [] };
  }
  const fullAssets = visit(directory).map((file) => ({
    file: path.relative(root, file).split(path.sep).join("/"),
    absolute: file,
    bytes: fs.statSync(file).size,
  })).sort((left, right) => right.bytes - left.bytes);
  const scripts = fullAssets.filter((asset) => asset.file.endsWith(".js"));
  return {
    available: true,
    totalBytes: fullAssets.reduce((sum, asset) => sum + asset.bytes, 0),
    scriptsBytes: scripts.reduce((sum, asset) => sum + asset.bytes, 0),
    stylesBytes: fullAssets.filter((asset) => asset.file.endsWith(".css")).reduce((sum, asset) => sum + asset.bytes, 0),
    gzipScriptsBytes: scripts.reduce((sum, asset) => sum + zlib.gzipSync(fs.readFileSync(asset.absolute), { level: 9 }).length, 0),
    brotliScriptsBytes: scripts.reduce((sum, asset) => sum + zlib.brotliCompressSync(fs.readFileSync(asset.absolute)).length, 0),
    assets: fullAssets.slice(0, 15).map(({ file, bytes }) => ({ file, bytes })),
  };
}
