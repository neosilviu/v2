import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function sqliteQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function findLocalD1DatabaseFile(projectDir) {
  const base = path.join(root, projectDir, ".wrangler", "state", "v3", "d1");
  if (!fs.existsSync(base))
    throw new Error(`Local D1 state directory not found: ${base}`);
  const stack = [base];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (
        entry.isFile() &&
        entry.name.endsWith(".sqlite") &&
        entry.name !== "metadata.sqlite"
      )
        return fullPath;
    }
  }
  throw new Error(`Local D1 database file not found under ${base}`);
}

function sqliteJson(dbFile, sql) {
  const result = spawnSync("sqlite3", ["-json", dbFile, sql], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0)
    throw new Error(
      `${dbFile} query failed\n${result.stdout}\n${result.stderr}`,
    );
  const text = result.stdout.trim();
  return text ? JSON.parse(text) : [];
}

export function applyLocalSqliteMigrations(
  projectDir,
  migrationDir = "migrations",
) {
  const dbFile = findLocalD1DatabaseFile(projectDir);
  const applied = new Set(
    sqliteJson(dbFile, "select name from d1_migrations order by id;").map(
      (row) => row.name,
    ),
  );
  const migrationsPath = path.join(root, projectDir, migrationDir);
  const files = fs
    .readdirSync(migrationsPath)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsPath, file), "utf8");
    const script = `BEGIN IMMEDIATE;\n${sql}\nINSERT INTO d1_migrations (name) VALUES (${sqliteQuote(file)});\nCOMMIT;\n`;
    const result = spawnSync("sqlite3", [dbFile], {
      input: script,
      encoding: "utf8",
      stdio: "pipe",
    });
    if (result.status !== 0)
      throw new Error(
        `Applying local migration ${file} to ${projectDir} failed\n${result.stdout}\n${result.stderr}`,
      );
    applied.add(file);
  }
}

export function executeLocalSqlite(projectDir, sql) {
  const dbFile = findLocalD1DatabaseFile(projectDir);
  const result = spawnSync("sqlite3", ["-json", dbFile, sql], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0)
    throw new Error(
      `Local SQL execution failed for ${projectDir}\n${result.stdout}\n${result.stderr}`,
    );
  return result.stdout;
}
