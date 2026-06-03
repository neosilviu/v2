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

const normalizeAssetPath = (value) =>
  String(value || "")
    .split("?")[0]
    .split("#")[0]
    .replace(/^\//, "")
    .replace(/^\.\//, "")
    .trim();
const resolveImport = (fromFile, importPath) => {
  if (importPath.startsWith("/")) return normalizeAssetPath(importPath);
  if (importPath.startsWith("."))
    return path.posix.normalize(
      path.posix.join(path.posix.dirname(fromFile), importPath),
    );
  return "";
};

function initialAssets(directory, assets) {
  const index = path.join(directory, "index.html");
  if (!fs.existsSync(index)) return [];
  const byFile = new Map(
    assets.map((asset) => [
      path.relative(directory, asset.absolute).split(path.sep).join("/"),
      asset,
    ]),
  );
  const html = fs.readFileSync(index, "utf8");
  const seeds = [
    ...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) =>
      normalizeAssetPath(match[1]),
    ),
    ...[...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)].map((match) =>
      normalizeAssetPath(match[1]),
    ),
  ].filter(Boolean);
  const seen = new Set();
  const queue = [...seeds];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);
    const asset = byFile.get(current);
    if (!asset || !current.endsWith(".js")) continue;
    const imports = [
      ...fs
        .readFileSync(asset.absolute, "utf8")
        .matchAll(/import(?:[^'"]*from)?["']([^'"]+)["']/g),
    ]
      .map((match) => resolveImport(current, match[1]))
      .filter((file) => file && byFile.has(file));
    queue.push(...imports);
  }
  return [...seen]
    .map((file) => byFile.get(file))
    .filter(Boolean)
    .sort((left, right) => right.bytes - left.bytes);
}

export function analyzeBundle(root) {
  const directory = path.join(root, "apps", "web", "dist");
  if (!fs.existsSync(directory)) {
    return {
      available: false,
      totalBytes: 0,
      scriptsBytes: 0,
      stylesBytes: 0,
      gzipScriptsBytes: 0,
      brotliScriptsBytes: 0,
      initialBytes: 0,
      initialGzipScriptsBytes: 0,
      initialBrotliScriptsBytes: 0,
      assets: [],
      initialAssets: [],
    };
  }
  const fullAssets = visit(directory)
    .map((file) => ({
      file: path.relative(root, file).split(path.sep).join("/"),
      absolute: file,
      bytes: fs.statSync(file).size,
    }))
    .sort((left, right) => right.bytes - left.bytes);
  const scripts = fullAssets.filter((asset) => asset.file.endsWith(".js"));
  const initial = initialAssets(directory, fullAssets);
  const initialScripts = initial.filter((asset) => asset.file.endsWith(".js"));
  return {
    available: true,
    totalBytes: fullAssets.reduce((sum, asset) => sum + asset.bytes, 0),
    scriptsBytes: scripts.reduce((sum, asset) => sum + asset.bytes, 0),
    stylesBytes: fullAssets
      .filter((asset) => asset.file.endsWith(".css"))
      .reduce((sum, asset) => sum + asset.bytes, 0),
    gzipScriptsBytes: scripts.reduce(
      (sum, asset) =>
        sum +
        zlib.gzipSync(fs.readFileSync(asset.absolute), { level: 9 }).length,
      0,
    ),
    brotliScriptsBytes: scripts.reduce(
      (sum, asset) =>
        sum + zlib.brotliCompressSync(fs.readFileSync(asset.absolute)).length,
      0,
    ),
    initialBytes: initial.reduce((sum, asset) => sum + asset.bytes, 0),
    initialScriptsBytes: initialScripts.reduce(
      (sum, asset) => sum + asset.bytes,
      0,
    ),
    initialStylesBytes: initial
      .filter((asset) => asset.file.endsWith(".css"))
      .reduce((sum, asset) => sum + asset.bytes, 0),
    initialGzipScriptsBytes: initialScripts.reduce(
      (sum, asset) =>
        sum +
        zlib.gzipSync(fs.readFileSync(asset.absolute), { level: 9 }).length,
      0,
    ),
    initialBrotliScriptsBytes: initialScripts.reduce(
      (sum, asset) =>
        sum + zlib.brotliCompressSync(fs.readFileSync(asset.absolute)).length,
      0,
    ),
    initialAssets: initial
      .slice(0, 15)
      .map(({ file, bytes }) => ({ file, bytes })),
    assets: fullAssets.slice(0, 15).map(({ file, bytes }) => ({ file, bytes })),
  };
}
