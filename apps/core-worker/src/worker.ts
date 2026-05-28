import app from "./index";
import { createPlatformSettingsRoutes } from "./platform-settings-routes";
import { createSurfaceRoutes } from "./surface-routes";
import { createRuntimeRegistryRoutes } from "./runtime-registry-routes";

app.route("/runtime/ui", createSurfaceRoutes());
app.route("/", createPlatformSettingsRoutes());
app.route("/", createRuntimeRegistryRoutes());

export default app;
