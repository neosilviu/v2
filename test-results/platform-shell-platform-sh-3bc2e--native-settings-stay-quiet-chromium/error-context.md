# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: platform-shell.spec.ts >> platform shell >> owner setup, workspace bootstrap and native settings stay quiet
- Location: tests/e2e/platform-shell.spec.ts:47:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: false
Received: true
```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic [ref=e7]: auth runtime
        - heading "Sign in" [level=2] [ref=e8]
      - generic [ref=e9]: public
    - paragraph [ref=e10]: Loading login configuration...
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { spawnSync } from "node:child_process";
  3   | 
  4   | const coreUrl = process.env.V2_CORE_URL ?? "http://localhost:8787";
  5   | const authUrl = process.env.V2_AUTH_URL ?? "http://localhost:8788";
  6   | const workspaceId = process.env.V2_E2E_WORKSPACE_ID ?? `e2e-${Date.now()}`;
  7   | const email = process.env.V2_E2E_EMAIL ?? `owner-${Date.now()}@example.local`;
  8   | const password = process.env.V2_E2E_PASSWORD ?? "LocalDevPassword123!";
  9   | 
  10  | function run(name: string, command: string, args: string[]) {
  11  |   const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe" });
  12  |   if (result.status !== 0) throw new Error(`${name} failed\n${result.stdout}\n${result.stderr}`);
  13  |   return result.stdout;
  14  | }
  15  | 
  16  | function applyLocalMigrations() {
  17  |   for (const [directory, database] of [["apps/auth-worker", "v2-auth"], ["apps/core-worker", "v2-core"], ["plugins/website-studio", "v2-website-studio"]]) {
  18  |     run(`migrations ${database}`, "pnpm", ["--dir", directory, "exec", "wrangler", "d1", "migrations", "apply", database, "--local"]);
  19  |   }
  20  | }
  21  | 
  22  | function provisionWorkspace() {
  23  |   const output = run("workspace provisioning", "node", ["scripts/provision-workspace.mjs", "--local", "--break-glass-print-token", "--workspace", workspaceId, "--name", "E2E Workspace", "--owner", email, "--ttl-hours", "2"]);
  24  |   const match = output.match(/Break-glass one-time setup URL: \/setup\/owner\?token=([^\s]+)/);
  25  |   if (!match?.[1]) throw new Error(`setup token missing from provisioning output: ${output}`);
  26  |   return decodeURIComponent(match[1]);
  27  | }
  28  | 
  29  | async function assertNoBrowserFailures(page, failures: string[]) {
  30  |   page.on("console", (message) => {
  31  |     if (message.type() === "error") failures.push(`console: ${message.text()}`);
  32  |   });
  33  |   page.on("response", (response) => {
  34  |     const status = response.status();
  35  |     const url = response.url();
  36  |     if ((status === 400 || status === 401 || status === 403 || status === 409 || status === 500 || status === 503) && (url.startsWith(coreUrl) || url.startsWith(authUrl))) {
  37  |       failures.push(`${status}: ${url}`);
  38  |     }
  39  |   });
  40  | }
  41  | 
  42  | test.describe("platform shell", () => {
  43  |   test.beforeAll(async () => {
  44  |     applyLocalMigrations();
  45  |   });
  46  | 
  47  |   test("owner setup, workspace bootstrap and native settings stay quiet", async ({ page }) => {
  48  |     const failures: string[] = [];
  49  |     await assertNoBrowserFailures(page, failures);
  50  | 
  51  |     const anonymousRequests: string[] = [];
  52  |     page.on("request", (request) => {
  53  |       if (request.url().startsWith(coreUrl) || request.url().startsWith(authUrl)) anonymousRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
  54  |     });
  55  |     await page.goto("/");
  56  |     await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
> 57  |     expect(anonymousRequests.some((item) => item.includes("/workspaces/current/bootstrap"))).toBe(false);
      |                                                                                              ^ Error: expect(received).toBe(expected) // Object.is equality
  58  |     expect(anonymousRequests.some((item) => item.includes("/bootstrap"))).toBe(false);
  59  |     expect(failures).toEqual([]);
  60  | 
  61  |     await page.goto("/login");
  62  |     await expect(page.getByRole("heading", { name: /sign in|login/i })).toBeVisible();
  63  | 
  64  |     const token = provisionWorkspace();
  65  |     await page.goto(`/setup/owner?token=${encodeURIComponent(token)}`);
  66  |     await expect(page.getByRole("heading", { name: "Owner setup" })).toBeVisible();
  67  |     const ownerForm = page.locator("form").filter({ hasText: "Authorized email" });
  68  |     await ownerForm.getByLabel("Name").fill("E2E Owner");
  69  |     await ownerForm.getByLabel("Password", { exact: true }).fill(password);
  70  |     await ownerForm.getByLabel("Confirm password").fill(password);
  71  |     await ownerForm.getByRole("button", { name: "Create owner account" }).click();
  72  |     await expect(page.getByText("Security administration")).toBeVisible();
  73  |     await expect(page.getByText(workspaceId).first()).toBeVisible();
  74  | 
  75  |     const dashboardRequests: string[] = [];
  76  |     page.on("request", (request) => {
  77  |       if (request.url().startsWith(coreUrl) || request.url().startsWith(authUrl)) dashboardRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
  78  |     });
  79  |     await page.goto(`/?workspace=${encodeURIComponent(workspaceId)}`);
  80  |     await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  81  |     expect(dashboardRequests.filter((item) => item.startsWith("OPTIONS "))).toEqual([]);
  82  |     expect(dashboardRequests.filter((item) => item.includes("/bootstrap")).length).toBeLessThanOrEqual(1);
  83  | 
  84  |     const securityRequests: string[] = [];
  85  |     page.on("request", (request) => {
  86  |       if (request.url().startsWith(coreUrl) || request.url().startsWith(authUrl)) securityRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
  87  |     });
  88  |     await page.goto(`/settings?workspace=${encodeURIComponent(workspaceId)}&tab=platform.settings.security`);
  89  |     await expect(page.getByText("Security administration")).toBeVisible();
  90  |     expect(securityRequests.some((item) => item.includes("/settings/tabs/platform.settings.security"))).toBe(false);
  91  |     expect(securityRequests.some((item) => item.includes("/runtime/ui/data"))).toBe(false);
  92  |     expect(securityRequests.some((item) => item.includes("/runtime/ui/actions"))).toBe(false);
  93  |     expect(securityRequests.filter((item) => item.includes("/auth/security-bootstrap")).length).toBeLessThanOrEqual(1);
  94  | 
  95  |     await page.goto(`/settings?workspace=${encodeURIComponent(workspaceId)}&tab=platform.settings.general`);
  96  |     await expect(page.getByRole("heading", { name: "General" })).toBeVisible();
  97  |     await page.getByLabel("Workspace name").fill("E2E Business");
  98  |     await page.getByRole("button", { name: "Save", exact: true }).click();
  99  |     await expect(page.getByText("General settings saved")).toBeVisible();
  100 | 
  101 |     for (const tab of ["Domains", "Mail Provider", "Plugins", "Interface"]) {
  102 |       await page.locator(".settings-tabs").getByRole("button", { name: tab }).click();
  103 |       const heading = tab;
  104 |       await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  105 |     }
  106 | 
  107 |     expect(failures).toEqual([]);
  108 |   });
  109 | });
  110 | 
```