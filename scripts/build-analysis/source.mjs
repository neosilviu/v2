import fs from "node:fs";
import path from "node:path";
import {
  codeExtensions,
  measuredExtensions,
  relativePath,
  walk,
} from "./common.mjs";

export function analyzeSource(root) {
  const byArea = {};
  for (const file of walk(root)) {
    const extension = path.extname(file).toLowerCase();
    if (!measuredExtensions.has(extension) || file.endsWith(".d.ts")) continue;
    const segments = relativePath(root, file).split("/");
    const area =
      ["apps", "packages", "plugins"].includes(segments[0]) && segments[1]
        ? `${segments[0]}/${segments[1]}`
        : segments[0];
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).length;
    byArea[area] ??= { files: 0, lines: 0, codeFiles: 0, codeLines: 0 };
    byArea[area].files += 1;
    byArea[area].lines += lines;
    if (codeExtensions.has(extension)) {
      byArea[area].codeFiles += 1;
      byArea[area].codeLines += lines;
    }
  }
  const areas = Object.fromEntries(
    Object.entries(byArea).sort(
      (left, right) => right[1].codeLines - left[1].codeLines,
    ),
  );
  return {
    areas,
    codeFiles: Object.values(areas).reduce(
      (sum, item) => sum + item.codeFiles,
      0,
    ),
    codeLines: Object.values(areas).reduce(
      (sum, item) => sum + item.codeLines,
      0,
    ),
    totalLines: Object.values(areas).reduce((sum, item) => sum + item.lines, 0),
  };
}
