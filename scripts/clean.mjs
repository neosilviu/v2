#!/usr/bin/env node
import { rm, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const mode = process.argv[2] ?? "clean";
const dryRun = process.argv.includes("--dry-run");

const modes = {
  clean: {
    description: "node_modules and temporary folders",
    names: new Set(["node_modules", "tmp", ".tmp"]),
  },
  "clean:dev": {
    description:
      "local install, build cache, dev database/runtime state and generated reports",
    names: new Set([
      "node_modules",
      ".pnpm-store",
      "tmp",
      ".tmp",
      ".turbo",
      ".wrangler",
      "dist",
      "coverage",
      "reports",
      "playwright-report",
      "test-results",
    ]),
  },
};

if (!modes[mode]) {
  console.error("Usage: pnpm clean [--dry-run] | pnpm clean:dev [--dry-run]");
  process.exit(1);
}

function isInsideRoot(target) {
  const relative = path.relative(root, target);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function collectTargets(directory, names, output = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (
      entry.name === ".git" ||
      entry.name === "node_modules" ||
      entry.name === ".pnpm-store" ||
      entry.name === ".wrangler" ||
      entry.name === ".turbo" ||
      entry.name === "dist"
    )
      continue;

    const fullPath = path.join(directory, entry.name);
    if (names.has(entry.name)) {
      output.push(fullPath);
      continue;
    }
    await collectTargets(fullPath, names, output);
  }
  return output;
}

const selected = modes[mode];
const targets = (await collectTargets(root, selected.names))
  .filter((target) => isInsideRoot(target))
  .sort((a, b) => a.localeCompare(b));

console.log(`v2 ${mode}: ${selected.description}`);

if (!targets.length) {
  console.log("Nothing to remove.");
  process.exit(0);
}

for (const target of targets) {
  const relative = path.relative(root, target);
  const info = await stat(target).catch(() => null);
  if (!info?.isDirectory()) continue;
  if (dryRun) {
    console.log(`[dry-run] ${relative}`);
    continue;
  }
  await rm(target, { recursive: true, force: true });
  console.log(`removed ${relative}`);
}

if (dryRun) {
  console.log(
    `Dry run complete. ${targets.length} director${targets.length === 1 ? "y" : "ies"} would be removed.`,
  );
} else {
  console.log(
    `Clean complete. Removed ${targets.length} director${targets.length === 1 ? "y" : "ies"}.`,
  );
}
