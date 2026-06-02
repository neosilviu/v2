import type { Risk, ToolContribution } from "@v2/plugin-contracts";

export type ApprovalDecision = "allow" | "require-approval" | "deny";
export type ToolExecutionContext = {
  permissions: ReadonlySet<string>;
  approvedToolIds?: ReadonlySet<string>;
};

const defaultDecisionByRisk: Record<Risk, ApprovalDecision> = {
  safe: "allow",
  reversible: "allow",
  sensitive: "require-approval",
  dangerous: "require-approval",
};

export class RuntimePolicy {
  decide(
    tool: ToolContribution,
    context: ToolExecutionContext,
  ): ApprovalDecision {
    const hasPermissions = tool.permissions.every((permission) =>
      context.permissions.has(permission),
    );
    if (!hasPermissions) return "deny";
    if (context.approvedToolIds?.has(tool.id)) return "allow";
    return defaultDecisionByRisk[tool.risk];
  }
}
