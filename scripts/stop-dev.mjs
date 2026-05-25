import { execFileSync } from "node:child_process";

const ports = [5173, 8787, 8788, 8790, 8791, 8792, 8793, 8794, 9229, 9287, 9288, 9290, 9291, 9292, 9293, 9294];

for (const port of ports) {
  try {
    const output = execFileSync("lsof", ["-ti", `tcp:${port}`], { encoding: "utf8" }).trim();
    if (!output) continue;
    for (const pid of output.split("\n")) {
      process.kill(Number(pid), "SIGTERM");
      console.log(`stopped pid ${pid} on port ${port}`);
    }
  } catch {
    // No process on this port, or lsof is unavailable.
  }
}

try {
  const output = execFileSync("pgrep", ["-af", "/home/admin/v2/.*(wrangler|workerd|vite|turbo).*dev|/home/admin/v2/.*workerd"], {
    encoding: "utf8",
  }).trim();
  for (const line of output.split("\n")) {
    const [pid] = line.split(/\s+/, 1);
    if (!pid || Number(pid) === process.pid) continue;
    process.kill(Number(pid), "SIGTERM");
    console.log(`stopped repo dev process ${pid}`);
  }
} catch {
  // No matching repo dev processes.
}
