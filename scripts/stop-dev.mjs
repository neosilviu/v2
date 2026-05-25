import { commandForPid, isRepoDevCommand, pidListForPort, readDevEndpoints, repoDevPids, root, sleep, stopPid } from "./dev-utils.mjs";

const stopped = new Set();

for (const endpoint of readDevEndpoints()) {
  for (const pid of pidListForPort(endpoint.port)) {
    if (stopped.has(pid)) continue;
    const command = commandForPid(pid);
    if (!isRepoDevCommand(command)) {
      console.log(`left pid ${pid} on port ${endpoint.port}; it is not from ${root}`);
      continue;
    }
    if (stopPid(pid)) {
      stopped.add(pid);
      console.log(`stopped pid ${pid} on ${endpoint.kind} port ${endpoint.port}`);
    }
  }
}

await sleep(500);

for (const pid of repoDevPids()) {
  if (stopped.has(pid)) continue;
  if (stopPid(pid)) {
    stopped.add(pid);
    console.log(`stopped repo dev process ${pid}`);
  }
}

await sleep(500);

for (const endpoint of readDevEndpoints()) {
  for (const pid of pidListForPort(endpoint.port)) {
    const command = commandForPid(pid);
    if (!isRepoDevCommand(command)) continue;
    try {
      process.kill(pid, "SIGKILL");
      stopped.add(pid);
      console.log(`force-stopped pid ${pid} on ${endpoint.kind} port ${endpoint.port}`);
    } catch {
      // Process already exited.
    }
  }
}

for (const pid of repoDevPids()) {
  if (stopped.has(pid)) continue;
  try {
    process.kill(pid, "SIGKILL");
    stopped.add(pid);
    console.log(`force-stopped repo dev process ${pid}`);
  } catch {
    // Process already exited.
  }
}

if (stopped.size === 0) console.log("no repo dev ports were active");
