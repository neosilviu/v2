# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: runtime-platform-shell.spec.ts >> runtime platform shell >> owner setup and runtime-declared settings render without browser failures
- Location: tests/e2e/runtime-platform-shell.spec.ts:83:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: /sign in/i })
Expected: visible
Error: strict mode violation: getByRole('heading', { name: /sign in/i }) resolved to 2 elements:
    1) <h1>Sign in</h1> aka locator('h1')
    2) <h2>Sign in</h2> aka locator('h2')

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByRole('heading', { name: /sign in/i })

```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: auth runtime
      - heading "Sign in" [level=1] [ref=e7]
      - paragraph [ref=e8]: Use the published authentication methods for this workspace.
      - generic [ref=e9]:
        - generic [ref=e10]:
          - strong [ref=e11]: Published login
          - generic [ref=e12]: Workspace policy
        - generic [ref=e13]:
          - strong [ref=e14]: "0"
          - generic [ref=e15]: Available methods
        - generic [ref=e16]:
          - strong [ref=e17]: "0"
          - generic [ref=e18]: Published types
    - generic [ref=e19]:
      - generic [ref=e20]:
        - generic [ref=e21]:
          - generic [ref=e22]: Access
          - heading "Sign in" [level=2] [ref=e23]
        - generic [ref=e24]: public
      - paragraph [ref=e25]: Loading login configuration...
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | import { spawnSync } from "node:child_process";
  3   | import { verifyRuntimeDeclaredSettings } from "./runtime-settings";
  4   | 
  5   | const coreUrl = process.env.V2_CORE_URL ?? "http://localhost:8787";
  6   | const authUrl = process.env.V2_AUTH_URL ?? "http://localhost:8788";
  7   | const workspaceId = process.env.V2_E2E_WORKSPACE_ID ?? `e2e-${Date.now()}`;
  8   | const email = process.env.V2_E2E_EMAIL ?? `owner-${Date.now()}@example.local`;
  9   | const password = process.env.V2_E2E_PASSWORD ?? "LocalDevPassword123!";
  10  | 
  11  | function run(name: string, command: string, args: string[]) {
  12  |   const result = spawnSync(command, args, { encoding: "utf8", stdio: "pipe" });
  13  |   if (result.status !== 0)
  14  |     throw new Error(`${name} failed\n${result.stdout}\n${result.stderr}`);
  15  |   return result.stdout;
  16  | }
  17  | 
  18  | function applyLocalMigrations() {
  19  |   for (const [directory, database] of [
  20  |     ["apps/auth-worker", "v2-auth"],
  21  |     ["apps/core-worker", "v2-core"],
  22  |     ["plugins/website-studio", "v2-website-studio"],
  23  |   ]) {
  24  |     run(`migrations ${database}`, "pnpm", [
  25  |       "--dir",
  26  |       directory,
  27  |       "exec",
  28  |       "wrangler",
  29  |       "d1",
  30  |       "migrations",
  31  |       "apply",
  32  |       database,
  33  |       "--local",
  34  |     ]);
  35  |   }
  36  | }
  37  | 
  38  | function provisionWorkspace() {
  39  |   const output = run("workspace provisioning", "node", [
  40  |     "scripts/provision-workspace.mjs",
  41  |     "--local",
  42  |     "--break-glass-print-token",
  43  |     "--workspace",
  44  |     workspaceId,
  45  |     "--name",
  46  |     "E2E Workspace",
  47  |     "--owner",
  48  |     email,
  49  |     "--ttl-hours",
  50  |     "2",
  51  |   ]);
  52  |   const marker = "token=";
  53  |   const start = output.indexOf(marker);
  54  |   if (start < 0)
  55  |     throw new Error(`setup token missing from provisioning output: ${output}`);
  56  |   const token = output
  57  |     .slice(start + marker.length)
  58  |     .trim()
  59  |     .split(/\s/)[0];
  60  |   if (!token)
  61  |     throw new Error(`setup token missing from provisioning output: ${output}`);
  62  |   return decodeURIComponent(token);
  63  | }
  64  | 
  65  | function observeFailures(page, failures: string[]) {
  66  |   page.on("console", (message) => {
  67  |     if (message.type() === "error") failures.push(`console: ${message.text()}`);
  68  |   });
  69  |   page.on("response", (response) => {
  70  |     const status = response.status();
  71  |     const url = response.url();
  72  |     if (
  73  |       [400, 401, 403, 409, 500, 503].includes(status) &&
  74  |       (url.startsWith(coreUrl) || url.startsWith(authUrl))
  75  |     )
  76  |       failures.push(`${status}: ${url}`);
  77  |   });
  78  | }
  79  | 
  80  | test.describe("runtime platform shell", () => {
  81  |   test.beforeAll(() => applyLocalMigrations());
  82  | 
  83  |   test("owner setup and runtime-declared settings render without browser failures", async ({
  84  |     page,
  85  |   }) => {
  86  |     const failures: string[] = [];
  87  |     observeFailures(page, failures);
  88  | 
  89  |     const anonymousBootstrapResponse = page.waitForResponse(
  90  |       (response) => new URL(response.url()).pathname === "/bootstrap",
  91  |     );
  92  |     await page.goto("/");
> 93  |     await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
      |                                                                   ^ Error: expect(locator).toBeVisible() failed
  94  |     expect(await (await anonymousBootstrapResponse).json()).toEqual({
  95  |       authenticated: false,
  96  |     });
  97  |     expect(failures).toEqual([]);
  98  | 
  99  |     const token = provisionWorkspace();
  100 |     await page.goto(`/setup/owner?token=${encodeURIComponent(token)}`);
  101 |     const ownerForm = page
  102 |       .locator("form")
  103 |       .filter({ hasText: "Authorized email" });
  104 |     await ownerForm.getByLabel("Name").fill("E2E Owner");
  105 |     await ownerForm.getByLabel("Password", { exact: true }).fill(password);
  106 |     await ownerForm.getByLabel("Confirm password").fill(password);
  107 |     await ownerForm
  108 |       .getByRole("button", { name: "Create owner account" })
  109 |       .click();
  110 |     await expect(page.getByText(workspaceId).first()).toBeVisible();
  111 | 
  112 |     await page.goto(`/?workspace=${encodeURIComponent(workspaceId)}`);
  113 |     await expect(
  114 |       page.getByRole("heading", { name: "Dashboard" }),
  115 |     ).toBeVisible();
  116 | 
  117 |     await verifyRuntimeDeclaredSettings(page, coreUrl, workspaceId);
  118 | 
  119 |     await page.goto(
  120 |       `/settings?workspace=${encodeURIComponent(workspaceId)}&tab=platform.settings.general`,
  121 |     );
  122 |     await page.getByLabel("Workspace name").fill("E2E Business");
  123 |     await page.getByRole("button", { name: "Save", exact: true }).click();
  124 |     await expect(page.getByText(/saved|successful/i).first()).toBeVisible();
  125 | 
  126 |     expect(failures).toEqual([]);
  127 |   });
  128 | });
  129 | 
```