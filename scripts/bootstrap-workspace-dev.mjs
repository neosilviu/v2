#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
function value(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}
const workspaceId = value("--workspace", process.env.V2_WORKSPACE_ID ?? "default");
const ownerEmail = value("--owner", process.env.V2_DEV_OWNER_EMAIL ?? "owner@example.local");
const passthrough = [
  "scripts/provision-workspace.mjs",
  "--local",
  "--break-glass-print-token",
  "--workspace", workspaceId,
  "--name", value("--name", "Local Dev Workspace"),
  "--owner", ownerEmail,
  "--ttl-hours", value("--ttl-hours", "168"),
];
const result = spawnSync("node", passthrough, { encoding: "utf8", stdio: "pipe" });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if ((result.status ?? 1) === 0) {
  console.log("");
  console.log("Development owner setup requires completing the one-time URL above in your browser.");
  console.log(`Open it on http://localhost:5173 and create the local owner account for ${ownerEmail}.`);
  console.log(`The created account will own workspace '${workspaceId}', the workspace loaded by the web application.`);
}
process.exit(result.status ?? 1);
