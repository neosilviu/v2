import app from "./index";
import { createSurfaceRoutes } from "./surface-routes";
import { createRuntimeRegistryRoutes } from "./runtime-registry-routes";

app.route("/runtime/ui", createSurfaceRoutes());
app.route("/", createRuntimeRegistryRoutes());

export default app;
