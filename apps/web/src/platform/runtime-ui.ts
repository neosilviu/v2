import { z } from "zod";
import { surfaceSchema, type SurfaceContribution } from "@v2/plugin-contracts";
import { coreApi, currentWorkspaceId } from "../api";
const runtimeSurfacesSchema = z.object({ surfaces: z.array(surfaceSchema) });

export async function loadRuntimeSurfaces(
  workspaceId = currentWorkspaceId(),
): Promise<SurfaceContribution[]> {
  const response = await coreApi.runtime.ui.surfaces.$get({
    query: { workspaceId },
  });
  if (!response.ok)
    throw new Error(
      `Runtime UI surfaces could not be loaded: ${response.status}`,
    );
  return runtimeSurfacesSchema.parse(await response.json()).surfaces;
}
