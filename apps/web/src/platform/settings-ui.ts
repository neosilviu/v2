import type { Notification } from "@v2/rpc-contracts";

export function createSettingsNotification(
  level: Notification["level"],
  title: string,
  message: string,
): Notification {
  return {
    id: crypto.randomUUID(),
    level,
    title,
    message,
    source: "settings",
    dismissible: true,
    createdAt: new Date().toISOString(),
  };
}
