import app from "./index";
import { createSurfaceRoutes } from "./surface-routes";

app.route("/runtime/ui", createSurfaceRoutes());

export default app;
