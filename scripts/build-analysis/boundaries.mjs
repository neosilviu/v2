import fs from "node:fs";
import path from "node:path";
import {
  codeExtensions,
  readJson,
  relativePath,
  walk,
  workspaceDirectories,
} from "./common.mjs";

const platformApps = new Set([
  "apps/core-worker",
  "apps/auth-worker",
  "apps/runtime-bridge",
  "apps/web",
]);
const importPattern =
  /\b(?:import|export)\b(?:[^"'`]*?\bfrom\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

export function readPackages(root) {
  return workspaceDirectories(root).flatMap((directory) => {
    const manifestPath = path.join(directory, "package.json");
    if (!fs.existsSync(manifestPath)) return [];
    const manifest = readJson(manifestPath);
    const dependencies = Object.keys({
      ...(manifest.dependencies ?? {}),
      ...(manifest.devDependencies ?? {}),
      ...(manifest.peerDependencies ?? {}),
    });
    return [
      {
        directory: relativePath(root, directory),
        name: manifest.name ?? relativePath(root, directory),
        dependencies,
        scripts: manifest.scripts ?? {},
      },
    ];
  });
}

export function analyzeBoundaries(root, packages) {
  const directories = new Map(
    packages.map((item) => [item.name, item.directory]),
  );
  const featurePluginPackages = new Set(
    packages
      .filter((item) => item.directory.startsWith("plugins/"))
      .map((item) => item.name),
  );
  const edges = packages.flatMap((owner) =>
    owner.dependencies
      .filter((dependency) => directories.has(dependency))
      .map((dependency) => ({
        from: owner.directory,
        to: directories.get(dependency),
        dependency,
      })),
  );
  const findings = edges
    .filter(
      (edge) => platformApps.has(edge.from) && edge.to.startsWith("plugins/"),
    )
    .map((edge) => ({
      type: "dependency",
      location: edge.from,
      message: `${edge.from} depends on concrete plugin ${edge.dependency}`,
    }));

  for (const app of platformApps) {
    const files = walk(path.join(root, app, "src")).filter((file) =>
      codeExtensions.has(path.extname(file).toLowerCase()),
    );
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      source.split(/\r?\n/).forEach((line, lineNumber) => {
        const imports = [...line.matchAll(importPattern)]
          .map((match) => match[1] ?? match[2])
          .filter(Boolean);
        for (const specifier of imports) {
          if (!featurePluginPackages.has(specifier)) continue;
          findings.push({
            type: "import",
            location: `${relativePath(root, file)}:${lineNumber + 1}`,
            message: `${relativePath(root, file)} imports concrete plugin package ${specifier}`,
          });
        }
      });
    }
  }
  return { platformApps: [...platformApps], packages, edges, findings };
}
