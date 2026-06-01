import { OwnerSetupPage } from "./OwnerSetupPage";
import { PublicPage } from "./PublicPage";

export function App() {
  if (window.location.pathname === "/setup/owner") return <OwnerSetupPage />;
  return <PublicPage />;
}
