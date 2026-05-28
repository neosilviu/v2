import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";

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
  const match = output.match(/Break-glass one-time setup URL: \/setup\/owner\?token=([^\s]+)/);
  if (!match?.[1]) throw new Error(`setup token missing from provisioning output: ${output}`);
  return decodeURIComponent(match[1]);
}

async function assertNoBrowserFailures(page, failures: string[]) {
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    const status = response.status();
    const url = response.url();
    if ((status === 400 || status === 401 || status === 403 || status === 409 || status === 500 || status === 503) && (url.startsWith(coreUrl) || url.startsWith(authUrl))) {
      failures.push(`${status}: ${url}`);
    }
  });
}

test.describe("platform shell", () => {
  test.beforeAll(async () => {
    applyLocalMigrations();
  });

  test("owner setup, workspace bootstrap and native settings stay quiet", async ({ page }) => {
    const failures: string[] = [];
    await assertNoBrowserFailures(page, failures);

    const anonymousRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith(coreUrl) || request.url().startsWith(authUrl)) {
        const url = new URL(request.url());
        anonymousRequests.push(`${request.method()} ${url.pathname}${url.search}`);
      }
    });
    const anonymousBootstrapResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/bootstrap");
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    const anonymousBootstrap = await anonymousBootstrapResponse;
    expect(await anonymousBootstrap.json()).toEqual({ authenticated: false });
    expect(anonymousRequests.filter((item) => item.startsWith("GET /bootstrap")).length).toBeLessThanOrEqual(1);
    expect(anonymousRequests.some((item) => item.includes("/workspaces/current/bootstrap"))).toBe(false);
    expect(anonymousRequests.some((item) => item.includes("/session"))).toBe(false);
    expect(failures).toEqual([]);

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in|login/i })).toBeVisible();

    const token = provisionWorkspace();
    await page.goto(`/setup/owner?token=${encodeURIComponent(token)}`);
    await expect(page.getByRole("heading", { name: "Owner setup" })).toBeVisible();
    const ownerForm = page.locator("form").filter({ hasText: "Authorized email" });
    await ownerForm.getByLabel("Name").fill("E2E Owner");
    await ownerForm.getByLabel("Password", { exact: true }).fill(password);
    await ownerForm.getByLabel("Confirm password").fill(password);
    await ownerForm.getByRole("button", { name: "Create owner account" }).click();
    await expect(page.getByText("Security administration")).toBeVisible();
    await expect(page.getByText(workspaceId).first()).toBeVisible();

    const dashboardRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith(coreUrl) || request.url().startsWith(authUrl)) dashboardRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    await page.goto(`/?workspace=${encodeURIComponent(workspaceId)}`);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    expect(dashboardRequests.filter((item) => item.startsWith("OPTIONS "))).toEqual([]);
    expect(dashboardRequests.some((item) => item.includes("/session"))).toBe(false);
    expect(dashboardRequests.filter((item) => item.includes("/bootstrap")).length).toBeLessThanOrEqual(1);

    const securityRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().startsWith(coreUrl) || request.url().startsWith(authUrl)) securityRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    });
    await page.goto(`/settings?workspace=${encodeURIComponent(workspaceId)}&tab=platform.settings.security`);
    await expect(page.getByText("Security administration")).toBeVisible();
    expect(securityRequests.filter((item) => item.includes("/settings/tabs/platform.settings.security")).length).toBeLessThanOrEqual(1);
    expect(securityRequests.some((item) => item.includes("/runtime/ui/data"))).toBe(false);
    expect(securityRequests.some((item) => item.includes("/runtime/ui/actions"))).toBe(false);
    expect(securityRequests.filter((item) => item.includes("/auth/security-bootstrap")).length).toBeLessThanOrEqual(1);

    await page.goto(`/settings?workspace=${encodeURIComponent(workspaceId)}&tab=platform.settings.general`);
    await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
    await page.getByLabel("Workspace name").fill("E2E Business");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("General settings saved")).toBeVisible();

    for (const tab of ["Domains", "Mail Provider", "Plugins", "Interface"]) {
      await page.locator(".settings-tabs").getByRole("button", { name: tab }).click();
      const heading = tab;
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    }

    expect(failures).toEqual([]);
  });
});
