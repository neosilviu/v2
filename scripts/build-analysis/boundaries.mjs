import fs from "node:fs";
import path from "node:path";
import { codeExtensions, readJson, relativePath, walk } from "./common.mjs";

const platformApps = new Set(["apps/core-worker", "apps/auth-worker", "apps/runtime-bridge", "apps/web"]);

export function readPackages(root) {
  return ["apps", "packages", "plugins"].flatMap((scope) => {
    const parent = path.join(root, scope);
    if (!fs.existsSync(parent)) return [];
    return fs.readdirSync(parent, { withFileTypes: true }).filter((item) => item.isDirectory()).flatMap((item) => {
      const manifestPath = path.join(parent, item.name, "package.json");
      if (!fs.existsSync(manifestPath)) return [];
      const manifest = readJson(manifestPath);
      const dependencies = Object.keys({
        ...(manifest.dependencies ?? {}),
        ...(manifest.devDependencies ?? {}),
        ...(manifest.peerDependencies ?? {}),
      });
      return [{ directory: `${scope}/${item.name}`, name: manifest.name ?? `${scope}/${item.name}`, dependencies }];
    });
  });
}

export function analyzeBoundaries(root, packages) {
  const directories = new Map(packages.map((item) => [item.name, item.directory]));
  const edges = packages.flatMap((owner) => owner.dependencies
    .filter((dependency) => directories.has(dependency))
    .map((dependency) => ({ from: owner.directory, to: directories.get(dependency), dependency })));
  const findings = edges
    .filter((edge) => platformApps.has(edge.from) && edge.to.startsWith("plugins/"))
    .map((edge) => ({ type: "dependency", location: edge.from, message: `${edge.from} depends on concrete plugin ${edge.dependency}` }));

  for (const app of platformApps) {
    const files = walk(path.join(root, app, "src")).filter((file) => codeExtensions.has(path.extname(file).toLowerCase()));
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      source.split(/\r?\n/).forEach((line, lineNumber) => {
        if (/["']@v2\/plugin-[^"']+["']/.test(line)) {
          findings.push({
            type: "import",
            location: `${relativePath(root, file)}:${lineNumber + 1}`,
            message: `${relativePath(root, file)} imports a concrete plugin`,
          });
        }
      });
    }
  }
  return { platformApps: [...platformApps], packages, edges, findings };
}
