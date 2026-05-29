import { spawn, spawnSync } from "node:child_process";
import { commandForPid, isRepoDevCommand, pidListForPort, readDevEndpoints, root, sleep, stopPid } from "./dev-utils.mjs";

async function reachable(url, path) {
  try {
    const response = await fetch(new URL(path, url));
    return response.ok;
  } catch {
    return false;
  }
}

async function waitFor(url, path, attempts = 240, delayMs = 1000) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await reachable(url, path)) return true;
    await sleep(delayMs);
  }
  return false;
}

async function stopOccupiedDevPorts() {
  const endpoints = readDevEndpoints();
  const seen = new Set();
  for (const endpoint of endpoints) {
    for (const pid of pidListForPort(endpoint.port)) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      const command = commandForPid(pid);
      if (!command || !isRepoDevCommand(command)) continue;
      stopPid(pid);
    }
  }
  await sleep(500);
  for (const endpoint of endpoints) {
    for (const pid of pidListForPort(endpoint.port)) {
      if (seen.has(pid)) continue;
      seen.add(pid);
      stopPid(pid);
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Process already exited.
      }
    }
  }
}

function startDetached(command, args, cwd = root) {
  const child = spawn(command, args, { cwd, detached: true, stdio: "ignore", env: process.env });
  child.unref();
}

export async function ensureLocalDevStack({ authUrl, coreUrl, webUrl }) {
  const [webReady, coreReady, authReady] = await Promise.all([
    reachable(webUrl, "/login"),
    reachable(coreUrl, "/health"),
    reachable(authUrl, "/health"),
  ]);
  if (webReady && coreReady && authReady) return;
  const stop = spawnSync("pnpm", ["dev:stop"], { cwd: root, encoding: "utf8", stdio: "pipe", env: process.env });
  if (stop.status !== 0 && stop.status !== null) {
    throw new Error(`Could not stop stale local dev processes before restart:\n${stop.stdout}\n${stop.stderr}`);
  }
  await stopOccupiedDevPorts();
  await sleep(500);
  if (!coreReady && !authReady && !webReady) {
    startDetached("pnpm", ["dev"]);
  } else if (!webReady && coreReady && authReady) {
    startDetached("pnpm", ["--dir", "apps/web", "dev"]);
  } else if (!coreReady || !authReady) {
    startDetached("pnpm", ["dev"]);
  }
  const ready = await Promise.all([
    waitFor(webUrl, "/login"),
    waitFor(coreUrl, "/health"),
    waitFor(authUrl, "/health"),
  ]);
  if (ready.some((item) => !item)) throw new Error(`Local dev services did not become ready at web=${webUrl} core=${coreUrl} auth=${authUrl}`);
}
