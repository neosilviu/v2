import type { ProfileData, ProfileWorkspace } from "./profile-types";

export const fieldValue = (value: string | null | undefined, fallback = "unset") => value?.trim() || fallback;
export const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
export const refreshProfile = () => window.location.reload();

export function navigateTo(pathname: string, params: Record<string, string | undefined> = {}) {
  const url = new URL(window.location.href);
  url.pathname = pathname;
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  window.location.assign(`${url.pathname}${url.search}${url.hash}`);
}

export function dateTimeLabel(value: number | string) {
  const date = typeof value === "number" ? new Date(value > 1_000_000_000_000 ? value : value * 1000) : new Date(value);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
}

export function sessionDeviceLabel(userAgent: string | null, current: boolean) {
  const ua = userAgent?.toLowerCase() ?? "";
  if (!ua) return current ? "Current browser" : "Browser session";
  if (ua.includes("iphone") || ua.includes("ipad")) return "iPhone / iPad";
  if (ua.includes("android")) return "Android device";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "Mac";
  if (ua.includes("windows")) return "Windows PC";
  if (ua.includes("linux")) return "Linux device";
  return current ? "Current browser" : "Browser session";
}

export function workspaceRoleLabel(workspace: ProfileWorkspace | null | undefined, profile?: ProfileData) {
  if (profile?.isPlatformAdmin) return "Superadmin";
  return workspace?.roles?.map((role) => role.name).filter(Boolean).join(", ") || "Member";
}
