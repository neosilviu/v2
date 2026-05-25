import fs from "node:fs";
import path from "node:path";

export function analyzeWorkers(root, packages) {
  return packages.flatMap((item) => {
    const config = path.join(root, item.directory, "wrangler.jsonc");
    if (!fs.existsSync(config)) return [];
    const text = fs.readFileSync(config, "utf8");
    const bindings = [...text.matchAll(/"binding"\s*:\s*"([^"]+)"/g)].map((match) => match[1]);
    return [{
      package: item.name,
      directory: item.directory,
      config: path.relative(root, config).split(path.sep).join("/"),
      bindings,
    }];
  });
}
