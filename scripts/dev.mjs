import { spawn } from "node:child_process";
import {
  commandForPid,
  isRepoDevCommand,
  pidListForPort,
  readDevEndpoints,
  readWorkspacePackages,
  repoDevPids,
  root,
  sleep,
  stopPid,
} from "./dev-utils.mjs";

const endpoints = readDevEndpoints();
const occupied = endpoints.flatMap((endpoint) =>
  pidListForPort(endpoint.port).map((pid) => ({ endpoint, pid })),
);

if (occupied.length > 0) {
  console.error(
    "Dev ports are already in use. Run `pnpm dev:stop` and try again:",
  );
  for (const { endpoint, pid } of occupied) {
    console.error(
      `- ${endpoint.name} ${endpoint.kind} port ${endpoint.port} is used by pid ${pid}`,
    );
  }
  process.exit(1);
}

const stopRepoDevPorts = async () => {
  const stopped = new Set();
  for (const endpoint of readDevEndpoints()) {
    for (const pid of pidListForPort(endpoint.port)) {
      if (stopped.has(pid)) continue;
      const command = commandForPid(pid);
      if (!isRepoDevCommand(command)) continue;
      if (stopPid(pid)) stopped.add(pid);
    }
  }
  for (const pid of repoDevPids()) {
    if (!stopped.has(pid) && stopPid(pid)) stopped.add(pid);
  }
  await sleep(300);
};

const turboArgs = ["turbo", "run", "dev"];
const persistentDevTasks = readWorkspacePackages().filter(
  (item) => typeof item.scripts.dev === "string",
).length;
turboArgs.push("--concurrency", String(Math.max(persistentDevTasks + 1, 1)));
if (process.env.CI === "true")
  turboArgs.push("--filter=!@v2/plugin-ai-providers");

const child = spawn("pnpm", turboArgs, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  child.kill(signal);
  await stopRepoDevPorts();
  process.exit(signal === "SIGINT" ? 130 : 143);
};

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

child.on("exit", async (code, signal) => {
  await stopRepoDevPorts();
  if (signal) process.exit(signal === "SIGINT" ? 130 : 143);
  process.exit(code ?? 1);
});
