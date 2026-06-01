import { spawn } from "node:child_process";

const child = spawn(
  "wrangler",
  [
    "dev",
    "--show-interactive-dev-session",
    "false",
    "--log-level",
    "error",
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    env: process.env,
  },
);

const shutdown = (signal) => {
  child.kill(signal);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(signal === "SIGINT" ? 130 : 143);
  process.exit(code ?? 1);
});
