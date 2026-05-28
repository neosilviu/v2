import { App } from "./App";
import { GeneratedWorkspaceApp } from "./GeneratedWorkspaceApp";

export function RootEntry() {
  const path = window.location.pathname;
  return path === "/setup/owner" || path.startsWith("/public/") ? <App /> : <GeneratedWorkspaceApp />;
}
