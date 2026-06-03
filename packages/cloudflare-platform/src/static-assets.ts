export type StaticAssetsDeploymentPlan = {
  workerName: string;
  directory: string;
  spaFallback: boolean;
};

export function staticAssetsConfig(plan: StaticAssetsDeploymentPlan) {
  return {
    name: plan.workerName,
    assets: {
      directory: plan.directory,
      not_found_handling: plan.spaFallback
        ? "single-page-application"
        : "404-page",
    },
  };
}
