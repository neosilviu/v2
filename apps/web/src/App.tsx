import { OwnerSetupPage } from "./OwnerSetupPage";
import { PublicPage } from "./PublicPage";
import { SettingsPage } from "./SettingsPage";

export function App() {
  void SettingsPage;
  if (window.location.pathname === "/setup/owner") return <OwnerSetupPage />;
  return <PublicPage />;
}
