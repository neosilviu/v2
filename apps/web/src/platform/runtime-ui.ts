import { hc } from "hono/client";
import { z } from "zod";
import { surfaceSchema, type SurfaceContribution } from "@v2/plugin-contracts";
import { coreUrl, currentWorkspaceId } from "../api";

type HonoRequestArgs = { query?: Record<string, string> };
type RuntimeUiClient = {
  runtime: {
    ui: {
      surfaces: { $get(args?: HonoRequestArgs): Promise<Response> };
    };
  };
};

const runtimeUiClient = hc(coreUrl, { init: { credentials: "include" } }) as unknown as RuntimeUiClient;
const runtimeSurfacesSchema = z.object({ surfaces: z.array(surfaceSchema) });

export async function loadRuntimeSurfaces(workspaceId = currentWorkspaceId()): Promise<SurfaceContribution[]> {
  const response = await runtimeUiClient.runtime.ui.surfaces.$get({ query: { workspaceId } });
  if (!response.ok) throw new Error(`Runtime UI surfaces could not be loaded: ${response.status}`);
  return runtimeSurfacesSchema.parse(await response.json()).surfaces;
}
