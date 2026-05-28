import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { verifyRuntimeDeclaredSettings } from "./runtime-settings";

const coreUrl = process.env.V2_CORE_URL ?? "http://localhost:8787";
const authUrl = process.env.V2_AUTH_URL ?? "http://localhost:8788";
const workspaceId = process.env.V2_E2E_WORKSPACE_ID ?? `e2e-${Date.now()}`;
const email = process.env.V2_E2E_EMAIL ?? `owner-${Date.now()}@example.local`;
const password = process.env.V2_E2E_PASSWORD ?? "LocalDevPassword123!";

function run(name: string, command: string, args: string[]) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) throw new Error(`${name} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

function applyLocalMigrations() {
  for (const [directory, database] of [["apps/auth-worker", "v2-auth"], ["apps/core-worker", "v2-core"], ["plugins/website-studio", "v2-website-studio"]]) {
    run(`migrations ${database}`, "pnpm", ["--dir", directory, "exec", "wrangler", "d1", "migrations", "apply", database, "--local"]);
  }
}

function provisionWorkspace() {
  const output = run("workspace provisioning", "node", ["scripts/provision-workspace.mjs", "--local", "--break-glass-print-token", "--workspace", workspaceId, "--name", "E2E Workspace", "--owner", email, "--ttl-hours", "2"]);
  const marker = "token=";
  const start = output.indexOf(marker);
  if (start < 0) throw new Error(`setup token missing from provisioning output: ${output}`);
  const token = output.slice(start + marker.length).trim().split(/\s/)[0];
  if (!token) throw new Error(`setup token missing from provisioning output: ${output}`);
  return decodeURIComponent(token);
}

function observeFailures(page, failures: string[]) {
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if ([400, 401, 403, 409, 500, 503].includes(status) && (url.startsWith(coreUrl) || url.startsWith(authUrl))) failures.push(`${status}: ${url}`);
  });
}

test.describe("runtime platform shell", () => {
  test.beforeAll(() => applyLocalMigrations());

  test("owner setup and runtime-declared settings render without browser failures", async ({ page }) => {
    const failures: string[] = [];
    observeFailures(page, failures);

    const anonymousBootstrapResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/bootstrap");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    expect(await (await anonymousBootstrapResponse).json()).toEqual({ authenticated: false });
    expect(failures).toEqual([]);

    const token = provisionWorkspace();
    await page.goto(`/setup/owner?token=${encodeURIComponent(token)}`);
    const ownerForm = page.locator("form").filter({ hasText: "Authorized email" });
    await ownerForm.getByLabel("Name").fill("E2E Owner");
    await ownerForm.getByLabel("Password", { exact: true }).fill(password);
    await ownerForm.getByLabel("Confirm password").fill(password);
    await ownerForm.getByRole("button", { name: "Create owner account" }).click();
    await expect(page.getByText(workspaceId).first()).toBeVisible();

    await page.goto(`/?workspace=${encodeURIComponent(workspaceId)}`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await verifyRuntimeDeclaredSettings(page, coreUrl, workspaceId);

    await page.goto(`/settings?workspace=${encodeURIComponent(workspaceId)}&tab=platform.settings.general`);
    await page.getByLabel("Workspace name").fill("E2E Business");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText(/saved|successful/i).first()).toBeVisible();

    expect(failures).toEqual([]);
  });
});
