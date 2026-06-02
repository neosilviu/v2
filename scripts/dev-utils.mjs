import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const workspacePatterns = () => {
  const workspace = fs.readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8");
  return [...workspace.matchAll(/^\s*-\s+(.+)$/gm)].map((match) => match[1].trim()).filter(Boolean);
};

const packageDirsForPattern = (pattern) => {
  if (!pattern.endsWith("/*")) return [path.join(root, pattern)];
  const base = path.join(root, pattern.slice(0, -2));
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(base, entry.name));
};

export const readWorkspacePackages = () =>
  workspacePatterns()
    .flatMap(packageDirsForPattern)
    .filter((directory) => fs.existsSync(path.join(directory, "package.json")))
    .map((directory) => {
      const manifest = readJson(path.join(directory, "package.json"));
      return {
        directory,
        relativeDirectory: path.relative(root, directory).split(path.sep).join("/"),
        name: manifest.name ?? path.basename(directory),
        scripts: manifest.scripts ?? {},
      };
    })
    .sort((left, right) => left.relativeDirectory.localeCompare(right.relativeDirectory));

const extractNumericFlag = (script, flag) => {
  const match = script.match(new RegExp(`(?:^|\\s)${flag}(?:=|\\s+)(\\d+)`));
  return match ? Number(match[1]) : null;
};

export const readDevEndpoints = () =>
  readWorkspacePackages()
    .filter((item) => typeof item.scripts.dev === "string")
    .flatMap((item) => {
      const script = item.scripts.dev;
      const endpoints = [];
      const port = extractNumericFlag(script, "--port");
      const inspectorPort = extractNumericFlag(script, "--inspector-port");
      if (port) {
        const kind = script.includes("wrangler dev") || script.includes("scripts/wrangler-dev.mjs") ? "worker" : "web";
        endpoints.push({ ...item, port, kind });
      }
      if (inspectorPort) endpoints.push({ ...item, port: inspectorPort, kind: "inspector" });
      return endpoints;
    });

export const pidListForPort = (port) => {
  try {
    const output = execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" }).trim();
    return output ? output.split(/\r?\n/).map((pid) => Number(pid)).filter(Boolean) : [];
  } catch {
    return [];
  }
};

export const commandForPid = (pid) => {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

export const isRepoDevCommand = (command) => {
  const isWorkspaceRelated = command.includes(root) || command.includes("wrangler-dev.mjs") || command.includes("scripts/");
  const isDevTool = /\b(wrangler|workerd|vite|turbo)\b/.test(command);
  return isWorkspaceRelated && isDevTool;
};

export const stopPid = (pid) => {
  try {
    process.kill(pid, "SIGTERM");
    return true;
  } catch {
    return false;
  }
};

export const repoDevPids = () => {
  try {
    return execFileSync("pgrep", ["-af", root], { encoding: "utf8" })
      .split(/\r?\n/)
      .flatMap((line) => {
        const [pidText, ...rest] = line.trim().split(/\s+/);
        const pid = Number(pidText);
        const command = rest.join(" ");
        if (!pid || pid === process.pid || !isRepoDevCommand(command)) return [];
        return [pid];
      });
  } catch {
    return [];
  }
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
