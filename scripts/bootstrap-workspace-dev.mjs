#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
function value(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}
const passthrough = [
  "scripts/provision-workspace.mjs",
  "--local",
  "--workspace", value("--workspace", process.env.V2_WORKSPACE_ID ?? "default"),
  "--name", value("--name", "Local Dev Workspace"),
  "--owner", value("--owner", process.env.V2_DEV_OWNER_EMAIL ?? "admin@aemdpc.ro"),
  "--ttl-hours", value("--ttl-hours", "168"),
];
const result = spawnSync("node", passthrough, { stdio: "inherit" });
process.exit(result.status ?? 1);
