import { expect, type Page } from "@playwright/test";

type RuntimeSettingsTab = { id: string; label: string; panelContributionId: string };
type RuntimeSettingsResolution = {
  tab: RuntimeSettingsTab;
  panel: { id: string; sections?: Array<{ id: string; title: string }> };
};

export async function verifyRuntimeDeclaredSettings(page: Page, coreUrl: string, workspaceId: string) {
  const tabsResponse = await page.request.get(`${coreUrl}/workspaces/${encodeURIComponent(workspaceId)}/settings/tabs`);
  expect(tabsResponse.ok(), await tabsResponse.text()).toBeTruthy();
  const payload = await tabsResponse.json() as { tabs: RuntimeSettingsTab[] };
  expect(payload.tabs.length).toBeGreaterThan(0);

  for (const tab of payload.tabs) {
    const panelResponse = await page.request.get(`${coreUrl}/workspaces/${encodeURIComponent(workspaceId)}/settings/tabs/${encodeURIComponent(tab.id)}`);
    expect(panelResponse.ok(), await panelResponse.text()).toBeTruthy();
    const resolution = await panelResponse.json() as RuntimeSettingsResolution;
    expect(resolution.tab.id).toBe(tab.id);
    expect(resolution.panel.id).toBe(tab.panelContributionId);

    await page.goto(`/settings?workspace=${encodeURIComponent(workspaceId)}&tab=${encodeURIComponent(tab.id)}`);
    await expect(page.getByRole("heading", { name: tab.label }).first()).toBeVisible();
    await expect(page.locator(".settings-tabs").getByRole("button", { name: tab.label })).toBeVisible();

    for (const section of resolution.panel.sections ?? []) {
      await expect(page.getByText(section.title).first()).toBeVisible();
    }
  }
}
