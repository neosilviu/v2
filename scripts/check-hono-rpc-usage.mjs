import fs from "node:fs";
import path from "node:path";

const root = path.resolve("apps/web/src");
const allowedFetchFile = path.join(root, "api.ts");
const allowedHcFile = path.join(root, "auth-api.ts");
const forbiddenImports = ["@v2/api-client", "createGeneratedApiClient"];
const requiredCoreApiMarkers = [
  'import { hc } from "hono/client";',
  "hc<CoreApi>",
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(?:ts|tsx|mts|cts|js|mjs)$/.test(entry.name) ? [full] : [];
  });
}

const files = walk(root);
let failed = false;

const apiSource = fs.readFileSync(allowedFetchFile, "utf8");
for (const marker of requiredCoreApiMarkers) {
  if (!apiSource.includes(marker)) {
    console.error(
      `[guard:hono-rpc] Missing required marker in ${path.relative(process.cwd(), allowedFetchFile)}: ${marker}`,
    );
    failed = true;
  }
}
for (const token of forbiddenImports) {
  if (apiSource.includes(token)) {
    console.error(
      `[guard:hono-rpc] Forbidden token in ${path.relative(process.cwd(), allowedFetchFile)}: ${token}`,
    );
    failed = true;
  }
}
if (!apiSource.includes("loadPublicPage")) {
  console.error(
    `[guard:hono-rpc] Missing loadPublicPage() exception in ${path.relative(process.cwd(), allowedFetchFile)}.`,
  );
  failed = true;
}
const fetchMatches = [...apiSource.matchAll(/\bfetch\s*\(/g)];
if (fetchMatches.length === 0) {
  console.error(
    `[guard:hono-rpc] Expected the public page fetch exception in ${path.relative(process.cwd(), allowedFetchFile)}.`,
  );
  failed = true;
}

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const relative = path.relative(process.cwd(), file);
  for (const token of forbiddenImports) {
    if (source.includes(token)) {
      console.error(
        `[guard:hono-rpc] Forbidden token in ${relative}: ${token}`,
      );
      failed = true;
    }
  }
  if (file !== allowedFetchFile && /\bfetch\s*\(/.test(source)) {
    console.error(
      `[guard:hono-rpc] Direct fetch() is only allowed in ${path.relative(process.cwd(), allowedFetchFile)}. Found in ${relative}.`,
    );
    failed = true;
  }
  if (
    file !== allowedFetchFile &&
    file !== allowedHcFile &&
    /import\s*\{\s*hc\s*\}\s*from\s*"hono\/client";/.test(source)
  ) {
    console.error(
      `[guard:hono-rpc] Direct hono/client usage is only allowed in ${path.relative(process.cwd(), allowedFetchFile)}. Found in ${relative}.`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);
