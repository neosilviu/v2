import type { Context } from "hono";
import type { MailProviderConfigure } from "@v2/mail-contracts";
import { isPlatformAdmin, type CoreSessionUser } from "./access";
import type { CoreRepository, WorkspacePermission, WorkspaceRecord } from "./repository";
import type { CoreEnv } from "./env";
import type { ActionDefinition } from "@v2/ui-schema";
import { ApprovalRequestRepository } from "./approval-requests";

type PlatformSettingsRuntimeContext = Context<{ Bindings: CoreEnv; Variables: { user: CoreSessionUser | null; internal: boolean } }>;

type AuthAdminJson = <T>(path: string, init?: { method?: string; headers?: HeadersInit; body?: string }) => Promise<T>;
type AuthForwardResponse = (path: string, init?: { method?: string; body?: string }) => Promise<Response>;
type AuthInternalJson = <T>(path: string) => Promise<T>;

export type PlatformSettingsRuntimeDependencies = {
  authAdminJson: AuthAdminJson;
  authForwardResponse: AuthForwardResponse;
  authInternalJson: AuthInternalJson;
};

export function platformActionInput(input: unknown) {
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

export function firstString(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function firstStringArray(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value.map((item) => item.trim()).filter(Boolean);
    if (typeof value === "string" && value.trim()) return [value.trim()];
  }
  return [];
}

export function firstBoolean(input: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (value === "true") return true;
      if (value === "false") return false;
    }
    if (typeof value === "number") return value !== 0;
  }
  return undefined;
}

export function toWorkspaceStatus(value: unknown): WorkspaceRecord["status"] | null {
  return value === "unprovisioned" || value === "provisioning" || value === "active" || value === "suspended" ? value : null;
}

export function toPlanStatus(value: unknown): "active" | "draft" | "disabled" | null {
  return value === "active" || value === "draft" || value === "disabled" ? value : null;
}

function operationEnvelope(status: "ok" | "denied" | "approval-required" | "unavailable", data: unknown = null, error: string | null = null, approvalId: string | null = null, auditEventId: string | null = null) {
  return { status, data, error, approvalId, auditEventId };
}

async function dispatchPluginOperation(c: PlatformSettingsRuntimeContext, repo: CoreRepository, workspaceId: string, pluginId: string, operationId: string, input: unknown, actorId?: string | null) {
  const deployment = await repo.activePluginRuntime(workspaceId, pluginId);
  if (!deployment) {
    await repo.audit(workspaceId, "marketplace.plugin.operation.unavailable", { pluginId, operationId }, actorId ?? undefined);
    return { ok: false as const, status: 503 as const, error: "Plugin runtime is not active." };
  }
  if (!c.env.PLUGIN_RUNTIME) {
    await repo.audit(workspaceId, "marketplace.plugin.operation.unavailable", { pluginId, operationId, runtimeKey: deployment.runtimeKey }, actorId ?? undefined);
    return { ok: false as const, status: 501 as const, error: "Plugin runtime dispatch is not configured." };
  }
  const response = await c.env.PLUGIN_RUNTIME.fetch("https://plugin-runtime.internal/dispatch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ workspaceId, pluginId, runtimeKey: deployment.runtimeKey, kind: "operation", operationId, input }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    await repo.audit(workspaceId, "marketplace.plugin.operation.denied", { pluginId, operationId, runtimeKey: deployment.runtimeKey, status: response.status }, actorId ?? undefined);
    return { ok: false as const, status: response.status === 404 ? 404 as const : 403 as const, error: "Plugin runtime rejected the operation." };
  }
  await repo.audit(workspaceId, "marketplace.plugin.operation.execute", { pluginId, operationId, runtimeKey: deployment.runtimeKey }, actorId ?? undefined);
  return { ok: true as const, data: body };
}

export async function platformSettingsRuntimeData(
  _c: PlatformSettingsRuntimeContext,
  repo: CoreRepository,
  workspaceId: string,
  dataSourceId: string,
  deps: PlatformSettingsRuntimeDependencies,
) {
  switch (dataSourceId) {
    case "platform.settings.general.read":
      return await repo.generalSettings(workspaceId);
    case "platform.settings.security.bootstrap": {
      const bootstrap = await deps.authInternalJson<{ summary: { policy: Record<string, unknown> } }>(`/internal/auth/security-bootstrap?workspaceId=${encodeURIComponent(workspaceId)}`);
      return bootstrap.summary.policy;
    }
    case "platform.settings.users.list": {
      const users = await deps.authAdminJson<{ users: unknown[] }>("/internal/auth/users");
      return users.users;
    }
    case "platform.settings.rbac.roles":
      return await repo.workspaceRoles(workspaceId);
    case "platform.settings.rbac.members":
      return await repo.workspaceMemberRecords(workspaceId);
    case "platform.settings.permissions.list":
      return await repo.workspacePermissionsCatalog(workspaceId);
    case "platform.settings.workspaces.list":
      return await repo.workspaces();
    case "platform.settings.plans.list":
      return await repo.plans();
    case "platform.settings.plans.assignments":
      return await repo.userPlanAssignments();
    case "platform.settings.invites.list":
      return await repo.workspaceInvitations(workspaceId);
    case "platform.settings.audit.events":
      return await repo.auditEvents(workspaceId);
    case "platform.settings.audit.policy":
      return await repo.workspaceAuditPolicy(workspaceId);
    case "platform.settings.mail.summary":
      return await repo.mailSummary(workspaceId);
    case "platform.settings.mail.providers":
      return (await repo.mailSummary(workspaceId)).providers;
    case "platform.settings.mail.templates":
      return await repo.listMailTemplates(workspaceId);
    case "platform.settings.mail.events":
      return await repo.listMailEvents(workspaceId);
    case "platform.settings.domains.list":
      return await repo.listDomains(workspaceId);
    case "platform.settings.plugins.catalog":
      return await repo.pluginCatalogRows(workspaceId);
    case "platform.settings.plugins.list":
      return await repo.pluginInstalledRows(workspaceId);
    case "platform.settings.approvals.list":
      return await new ApprovalRequestRepository(_c.env.CORE_DB).listPending(workspaceId);
    default:
      return null;
  }
}

export async function platformSettingsRuntimeAction(
  c: PlatformSettingsRuntimeContext,
  repo: CoreRepository,
  workspaceId: string,
  action: ActionDefinition,
  input: unknown,
  deps: PlatformSettingsRuntimeDependencies,
) {
  const actor = c.get("user");
  const actorId = actor?.id ?? null;
  const isSuperadmin = isPlatformAdmin(c.env, actor);
  const payload = platformActionInput(input);
  const denied = (status: 400 | 403 | 404 | 409, message: string) => c.json(operationEnvelope("denied", null, message), status);
  try {
    switch (action.commandId) {
      case "platform.settings.general.save": {
        const settings = await repo.saveGeneralSettings(workspaceId, payload, actorId ?? undefined);
        return c.json(operationEnvelope("ok", settings));
      }
      case "platform.settings.security.policy.save": {
        const body = {
          workspaceId,
          registrationMode: firstString(payload, "registrationMode") ?? "disabled",
          requireEmailVerification: firstBoolean(payload, "requireEmailVerification") ?? false,
          allowPasskeyRegistration: firstBoolean(payload, "allowPasskeyRegistration") ?? false,
          allowPasskeySignin: firstBoolean(payload, "allowPasskeySignin") ?? false,
          turnstileEnabled: firstBoolean(payload, "turnstileEnabled") ?? false,
          turnstileSiteKey: firstString(payload, "turnstileSiteKey"),
          turnstileSecretRef: firstString(payload, "turnstileSecretRef"),
        };
        const response = await deps.authAdminJson<{ policy: unknown }>("/admin/auth/policy", { method: "PUT", body: JSON.stringify(body) });
        await repo.audit(workspaceId, "platform.settings.security.policy.save", { workspaceId, registrationMode: body.registrationMode, turnstileEnabled: body.turnstileEnabled }, actorId ?? undefined);
        return c.json(operationEnvelope("ok", response.policy));
      }
      case "platform.settings.audit.policy.save": {
        if (!isSuperadmin) return denied(403, "Platform admin access is required to update audit policy.");
        const current = await repo.workspaceAuditPolicy(workspaceId);
        const policy = {
          auth: firstBoolean(payload, "auth") ?? current.auth,
          core: firstBoolean(payload, "core") ?? current.core,
          plugin: firstBoolean(payload, "plugin") ?? current.plugin,
          shell: firstBoolean(payload, "shell") ?? current.shell,
        };
        const saved = await repo.saveWorkspaceAuditPolicy(workspaceId, policy, actorId ?? undefined);
        return c.json(operationEnvelope("ok", saved));
      }
      case "platform.settings.users.disable":
      case "platform.settings.users.delete": {
        const target = firstString(payload, "userId", "targetUserId", "memberUserId", "id") ? await repo.authUserById(firstString(payload, "userId", "targetUserId", "memberUserId", "id")!) : firstString(payload, "email", "targetEmail") ? await repo.authUserByEmail(firstString(payload, "email", "targetEmail")!) : null;
        if (!target) return denied(404, "User is not available.");
        if (target.isPlatformAdmin) return denied(403, "Protected Superadmin accounts cannot be modified.");
        const response = action.commandId === "platform.settings.users.disable"
          ? await repo.disableAuthUser(target.id)
          : await repo.deleteAuthUser(target.id);
        if (!response.ok) return denied(response.status === 404 ? 404 : 403, "User operation failed.");
        await repo.audit(workspaceId, action.commandId, { targetUserId: target.id, targetEmail: target.email }, actorId ?? undefined);
        return c.json(operationEnvelope("ok", { userId: target.id, email: target.email }));
      }
      case "platform.settings.workspaces.upsert": {
        const name = firstString(payload, "name", "workspaceName");
        if (!name) return denied(400, "name is required.");
        const targetWorkspaceId = firstString(payload, "id", "workspaceId");
        const existingWorkspace = targetWorkspaceId ? await repo.workspace(targetWorkspaceId) : null;
        const workspaceInput: { id?: string; name: string; status: WorkspaceRecord["status"] } = { name, status: toWorkspaceStatus(payload.status) ?? existingWorkspace?.status ?? "unprovisioned" };
        if (targetWorkspaceId) workspaceInput.id = targetWorkspaceId;
        const workspace = await repo.upsertWorkspace(workspaceInput, actorId ?? undefined);
        if (!workspace) return denied(404, "Workspace is not available.");
        return c.json(operationEnvelope("ok", workspace));
      }
      case "platform.settings.workspaces.delete": {
        const targetWorkspaceId = firstString(payload, "workspaceId", "id");
        if (!targetWorkspaceId) return denied(400, "workspaceId is required.");
        const deleted = await repo.deleteWorkspace(targetWorkspaceId, actorId ?? undefined);
        if (!deleted) return denied(403, "Workspace deletion is not allowed.");
        return c.json(operationEnvelope("ok", { workspaceId: targetWorkspaceId, deleted: true }));
      }
      case "platform.settings.rbac.member.role.assign": {
        if (!isSuperadmin && !(await repo.hasPermission(workspaceId, actor, "workspace.members.manage"))) return denied(403, "Workspace membership management permission is required.");
        const targetUserId = firstString(payload, "userId", "memberUserId", "targetUserId");
        if (!targetUserId) return denied(400, "userId is required.");
        const roleIds = firstStringArray(payload, "roleIds", "roleId");
        if (!roleIds.length) return denied(400, "roleId is required.");
        const target = await repo.authUserById(targetUserId);
        if (!target) return denied(404, "User is not available.");
        const updated = await repo.assignWorkspaceMemberRoles(workspaceId, target.id, roleIds, actorId ?? undefined);
        return c.json(operationEnvelope("ok", updated));
      }
      case "platform.settings.rbac.member.role.remove": {
        if (!isSuperadmin && !(await repo.hasPermission(workspaceId, actor, "workspace.members.manage"))) return denied(403, "Workspace membership management permission is required.");
        const targetUserId = firstString(payload, "userId", "memberUserId", "targetUserId");
        if (!targetUserId) return denied(400, "userId is required.");
        const roleIds = firstStringArray(payload, "roleIds", "roleId");
        if (!roleIds.length) return denied(400, "roleId is required.");
        const target = await repo.authUserById(targetUserId);
        if (!target) return denied(404, "User is not available.");
        const updated = await repo.removeWorkspaceMemberRoles(workspaceId, target.id, roleIds, actorId ?? undefined);
        return c.json(operationEnvelope("ok", updated));
      }
      case "platform.settings.rbac.member.remove": {
        if (!isSuperadmin && !(await repo.hasPermission(workspaceId, actor, "workspace.members.manage"))) return denied(403, "Workspace membership management permission is required.");
        const targetUserId = firstString(payload, "userId", "memberUserId", "targetUserId");
        if (!targetUserId) return denied(400, "userId is required.");
        const target = await repo.authUserById(targetUserId);
        if (!target) return denied(404, "User is not available.");
        const updated = await repo.removeWorkspaceMember(workspaceId, target.id, actorId ?? undefined);
        return c.json(operationEnvelope("ok", updated));
      }
      case "platform.settings.rbac.member.override.allow":
      case "platform.settings.rbac.member.override.deny": {
        if (!isSuperadmin && !(await repo.hasPermission(workspaceId, actor, "workspace.members.manage"))) return denied(403, "Workspace membership management permission is required.");
        const targetUserId = firstString(payload, "userId", "memberUserId", "targetUserId");
        const permission = firstString(payload, "permission");
        if (!targetUserId || !permission) return denied(400, "userId and permission are required.");
        const target = await repo.authUserById(targetUserId);
        if (!target) return denied(404, "User is not available.");
        if (target.isPlatformAdmin) return denied(403, "Protected Superadmin accounts cannot receive workspace overrides.");
        if (action.commandId === "platform.settings.rbac.member.override.deny" && (await repo.workspaceOwnerCount(workspaceId)) <= 1) return denied(409, "The last active Owner cannot be denied a permission.");
        const updated = await repo.setMemberPermissionOverride(workspaceId, target.id, permission as WorkspacePermission, action.commandId.endsWith("allow") ? "allow" : "deny", actorId ?? undefined);
        return c.json(operationEnvelope("ok", updated));
      }
      case "platform.settings.rbac.member.override.remove": {
        if (!isSuperadmin && !(await repo.hasPermission(workspaceId, actor, "workspace.members.manage"))) return denied(403, "Workspace membership management permission is required.");
        const targetUserId = firstString(payload, "userId", "memberUserId", "targetUserId");
        const permission = firstString(payload, "permission");
        if (!targetUserId || !permission) return denied(400, "userId and permission are required.");
        const target = await repo.authUserById(targetUserId);
        if (!target) return denied(404, "User is not available.");
        const updated = await repo.removeMemberPermissionOverride(workspaceId, target.id, permission as WorkspacePermission, actorId ?? undefined);
        return c.json(operationEnvelope("ok", updated));
      }
      case "platform.settings.rbac.role.create": {
        const name = firstString(payload, "name");
        if (!name) return denied(400, "name is required.");
        const role = await repo.createWorkspaceRole(workspaceId, { name, description: firstString(payload, "description") }, actorId ?? undefined);
        return c.json(operationEnvelope("ok", role));
      }
      case "platform.settings.rbac.role.update": {
        const roleId = firstString(payload, "roleId", "id");
        if (!roleId) return denied(400, "roleId is required.");
        const roleInput: { name?: string; description?: string | null } = {};
        const name = firstString(payload, "name");
        if (name) roleInput.name = name;
        const description = firstString(payload, "description");
        if (description !== undefined) roleInput.description = description;
        const role = await repo.updateWorkspaceRole(workspaceId, roleId, roleInput, actorId ?? undefined);
        if (!role) return denied(404, "Role is not available.");
        return c.json(operationEnvelope("ok", role));
      }
      case "platform.settings.rbac.role.delete": {
        const roleId = firstString(payload, "roleId", "id");
        if (!roleId) return denied(400, "roleId is required.");
        const deleted = await repo.deleteWorkspaceRole(workspaceId, roleId, actorId ?? undefined);
        if (!deleted) return denied(403, "Role deletion is not allowed.");
        return c.json(operationEnvelope("ok", { roleId, deleted: true }));
      }
      case "platform.settings.plans.upsert": {
        const planId = firstString(payload, "id", "planId");
        const name = firstString(payload, "name");
        if (!planId || !name) return denied(400, "id and name are required.");
        const limitsRaw = payload.limits ?? payload.limitsJson ?? "{}";
        let limits: Record<string, unknown>;
        try {
          limits = typeof limitsRaw === "string" ? JSON.parse(limitsRaw) as Record<string, unknown> : limitsRaw as Record<string, unknown>;
        } catch {
          return denied(400, "limits must be valid JSON.");
        }
        const planStatus = toPlanStatus(payload.status) ?? "draft";
        const plan = await repo.upsertPlan({ id: planId, name, status: planStatus, limits }, actorId ?? undefined);
        return c.json(operationEnvelope("ok", plan));
      }
      case "platform.settings.plans.delete": {
        const planId = firstString(payload, "id", "planId");
        if (!planId) return denied(400, "planId is required.");
        await repo.deletePlan(planId, actorId ?? undefined);
        return c.json(operationEnvelope("ok", { planId, deleted: true }));
      }
      case "platform.settings.plans.assignment.upsert": {
        const userId = firstString(payload, "userId", "targetUserId");
        const planId = firstString(payload, "planId");
        if (!userId || !planId) return denied(400, "userId and planId are required.");
        const target = await repo.authUserById(userId);
        if (!target) return denied(404, "User is not available.");
        const assignment = await repo.upsertUserPlanAssignment({
          ...(firstString(payload, "id", "assignmentId") ? { id: firstString(payload, "id", "assignmentId")! } : {}),
          userId,
          planId,
          status: (payload.status === "active" || payload.status === "scheduled" || payload.status === "expired" || payload.status === "disabled" ? payload.status : "active") as "active" | "scheduled" | "expired" | "disabled",
          startsAt: firstString(payload, "startsAt"),
          endsAt: firstString(payload, "endsAt"),
        }, actorId ?? undefined);
        return c.json(operationEnvelope("ok", assignment));
      }
      case "platform.settings.plans.assignment.delete": {
        const assignmentId = firstString(payload, "id", "assignmentId");
        if (!assignmentId) return denied(400, "assignmentId is required.");
        await repo.deleteUserPlanAssignment(assignmentId, actorId ?? undefined);
        return c.json(operationEnvelope("ok", { assignmentId, deleted: true }));
      }
      case "platform.settings.invites.create": {
        const email = firstString(payload, "email");
        if (!email) return denied(400, "email is required.");
        const invite = await repo.createWorkspaceInvitation(workspaceId, { email, roleId: firstString(payload, "roleId"), expiresAt: firstString(payload, "expiresAt") }, actorId ?? undefined);
        return c.json(operationEnvelope("ok", invite));
      }
      case "platform.settings.invites.delete": {
        const inviteId = firstString(payload, "id", "invitationId");
        if (!inviteId) return denied(400, "invitationId is required.");
        await repo.deleteWorkspaceInvitation(workspaceId, inviteId, actorId ?? undefined);
        return c.json(operationEnvelope("ok", { invitationId: inviteId, deleted: true }));
      }
      case "platform.settings.invites.revoke": {
        const inviteId = firstString(payload, "id", "invitationId");
        if (!inviteId) return denied(400, "invitationId is required.");
        const invite = await repo.revokeWorkspaceInvitation(workspaceId, inviteId, actorId ?? undefined);
        return c.json(operationEnvelope("ok", invite));
      }
      case "platform.settings.marketplace.plugin.activate": {
        const pluginId = firstString(payload, "pluginId", "id");
        if (!pluginId) return denied(400, "pluginId is required.");
        const deployment = await repo.pluginRuntimeDeployment(workspaceId, pluginId);
        if (!deployment || !["deployed", "active", "disabled"].includes(deployment.runtimeStatus)) return denied(409, "Plugin runtime deployment must be confirmed before activation.");
        const state = await repo.activate(workspaceId, pluginId);
        if (!state) return denied(404, "Plugin is not installed.");
        await repo.audit(workspaceId, "marketplace.plugin.activate", { pluginId }, actorId ?? undefined);
        return c.json(operationEnvelope("ok", state));
      }
      case "platform.settings.marketplace.plugin.deactivate": {
        const pluginId = firstString(payload, "pluginId", "id");
        if (!pluginId) return denied(400, "pluginId is required.");
        const state = await repo.deactivate(workspaceId, pluginId);
        if (!state) return denied(404, "Plugin is not installed.");
        await repo.audit(workspaceId, "marketplace.plugin.deactivate", { pluginId }, actorId ?? undefined);
        return c.json(operationEnvelope("ok", state));
      }
      case "platform.settings.marketplace.plugin.uninstall": {
        const pluginId = firstString(payload, "pluginId", "id");
        if (!pluginId) return denied(400, "pluginId is required.");
        const state = await repo.uninstall(workspaceId, pluginId);
        if (!state) return denied(404, "Plugin is not installed.");
        await repo.audit(workspaceId, "marketplace.plugin.uninstall", { pluginId }, actorId ?? undefined);
        return c.json(operationEnvelope("ok", state));
      }
      case "platform.settings.marketplace.demo.install":
      case "platform.settings.marketplace.demo.remove": {
        const pluginId = firstString(payload, "pluginId", "id");
        if (!pluginId) return denied(400, "pluginId is required.");
        const manifest = await repo.installedById(pluginId);
        if (!manifest) return denied(404, "Plugin is not installed.");
        const operation = action.commandId.endsWith("install")
          ? manifest.api.operations.find((item) => item.id === firstString(payload, "demoInstallOperationId", "operationId") || (/demo/i.test(item.id) && /install|seed/i.test(item.id)))
          : manifest.api.operations.find((item) => item.id === firstString(payload, "demoRemoveOperationId", "operationId") || (/demo/i.test(item.id) && /remove|cleanup|purge/i.test(item.id)));
        if (!operation) return c.json(operationEnvelope("unavailable", null, action.commandId.endsWith("install") ? "Plugin does not expose a demo install operation." : "Plugin does not expose a demo cleanup operation."), 501);
        const permissions = operation.permission ? [operation.permission] : [];
        if (permissions.length && !isSuperadmin && !(await repo.hasAllPermissions(workspaceId, actor, permissions))) return denied(403, "Plugin operation permission is required.");
        const result = await dispatchPluginOperation(c, repo, workspaceId, pluginId, operation.id, { workspaceId }, actorId);
        if (!result.ok) return c.json(operationEnvelope("unavailable", null, result.error), result.status);
        return c.json(operationEnvelope("ok", result.data));
      }
      case "platform.settings.approvals.approve":
      case "platform.settings.approvals.deny": {
        const approvalId = firstString(payload, "approvalId", "id");
        if (!approvalId) return denied(400, "approvalId is required.");
        const decision = action.commandId === "platform.settings.approvals.approve" ? "approved" : "denied";
        const approval = await new ApprovalRequestRepository(c.env.CORE_DB).decide(workspaceId, approvalId, decision, actorId ?? undefined);
        if (!approval) return denied(409, "Approval is not pending.");
        await repo.audit(workspaceId, `approval.${decision}`, { approvalId: approval.id, kind: approval.kind, subjectId: approval.subjectId, pluginId: approval.pluginId }, actorId ?? undefined);
        return c.json(operationEnvelope("ok", approval));
      }
      case "platform.settings.mail.provider.save": {
        const provider = await repo.saveMailProvider(workspaceId, {
          kind: (payload.kind === "transactional-http" || payload.kind === "smtp" || payload.kind === "mock-development-only" ? payload.kind : "transactional-http") as "transactional-http" | "smtp" | "mock-development-only",
          label: firstString(payload, "label") ?? "Mail provider",
          fromName: firstString(payload, "fromName") ?? "",
          fromEmail: firstString(payload, "fromEmail") ?? "",
          replyToEmail: firstString(payload, "replyToEmail") ?? null,
          configurationRef: firstString(payload, "configurationRef") ?? null,
          enabled: firstBoolean(payload, "enabled") ?? true,
          safeConfig: typeof payload.safeConfig === "object" && payload.safeConfig ? payload.safeConfig as Record<string, unknown> : { usernameConfigured: false, passwordConfigured: false, secretHint: null },
        } as MailProviderConfigure, actorId ?? undefined);
        return c.json(operationEnvelope("ok", provider));
      }
      case "platform.settings.mail.provider.activate": {
        const providerId = firstString(payload, "id", "providerId");
        if (!providerId) return denied(400, "providerId is required.");
        const provider = await repo.activateMailProvider(workspaceId, providerId, actorId ?? undefined);
        return c.json(operationEnvelope("ok", provider));
      }
      case "platform.settings.mail.provider.disable": {
        const providerId = firstString(payload, "id", "providerId");
        if (!providerId) return denied(400, "providerId is required.");
        const provider = await repo.disableMailProvider(workspaceId, providerId, actorId ?? undefined);
        return c.json(operationEnvelope("ok", provider));
      }
      case "platform.settings.mail.provider.test": {
        const providerId = firstString(payload, "id", "providerId");
        const to = firstString(payload, "to");
        if (!providerId || !to) return denied(400, "providerId and to are required.");
        const result = await repo.testMailProvider(workspaceId, providerId, to, actorId ?? undefined);
        return c.json(operationEnvelope("ok", result));
      }
      case "platform.settings.interface.nav.edit":
      case "platform.settings.interface.nav.hide": {
        const contributionId = firstString(payload, "contributionId", "id");
        if (!contributionId) return denied(400, "contributionId is required.");
        const changes: {
          enabled?: boolean;
          visibleInNavigation?: boolean;
          label?: string;
          icon?: string;
          section?: "user" | "administration";
          displayOrder?: number;
        } = {};
        const label = firstString(payload, "label");
        if (label) changes.label = label;
        const icon = firstString(payload, "icon");
        if (icon) changes.icon = icon;
        const section = firstString(payload, "section");
        if (section === "user" || section === "administration") changes.section = section;
        if (typeof payload.displayOrder === "number") changes.displayOrder = payload.displayOrder;
        const visibleInNavigation = firstBoolean(payload, "visibleInNavigation");
        if (action.commandId.endsWith("hide")) changes.visibleInNavigation = false;
        else if (visibleInNavigation !== undefined) changes.visibleInNavigation = visibleInNavigation;
        const enabled = firstBoolean(payload, "enabled");
        if (enabled !== undefined) changes.enabled = enabled;
        const updated = await repo.updatePluginUiContribution(workspaceId, contributionId, changes, actorId ?? undefined);
        if (!updated) return denied(404, "Interface contribution is not available.");
        return c.json(operationEnvelope("ok", updated));
      }
      case "platform.settings.users.view":
      case "platform.settings.users.edit": {
        const targetUserId = firstString(payload, "userId", "targetUserId", "id");
        const targetEmail = firstString(payload, "email", "targetEmail");
        const target = targetUserId ? await repo.authUserById(targetUserId) : targetEmail ? await repo.authUserByEmail(targetEmail) : null;
        if (!target) return denied(404, "User is not available.");
        await repo.audit(workspaceId, action.commandId, { targetUserId: target.id, targetEmail: target.email }, actorId ?? undefined);
        return c.json(operationEnvelope("ok", target));
      }
      case "platform.settings.users.impersonate":
      case "platform.settings.rbac.member.impersonate": {
        const targetUserId = firstString(payload, "userId", "targetUserId", "memberUserId", "id");
        const reason = firstString(payload, "reason") ?? "";
        if (!targetUserId || !reason) return denied(400, "userId and reason are required.");
        const target = await repo.authUserById(targetUserId);
        if (!target) return denied(404, "User is not available.");
        if (target.isPlatformAdmin) return denied(403, "Platform superadmin accounts cannot be impersonated.");
        const response = await deps.authForwardResponse("/internal/auth/impersonation/start", {
          method: "POST",
          body: JSON.stringify({
            expectedActorUserId: actorId ?? "",
            subjectUserId: target.id,
            workspaceId,
            reason,
          }),
        });
        const setCookie = response.headers.get("set-cookie");
        if (setCookie) c.header("Set-Cookie", setCookie);
        const body = await response.json().catch(() => null);
        if (!response.ok) return denied(response.status === 404 ? 404 : 403, "Impersonation could not be started.");
        await repo.audit(workspaceId, action.commandId, { targetUserId: target.id, targetEmail: target.email, reason }, actorId ?? undefined);
        return c.json(operationEnvelope("ok", body));
      }
      default:
        return null;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Operation failed.";
    if (/not available|not found|could not be found/i.test(message)) return denied(404, message);
    if (/protected/i.test(message)) return denied(403, message);
    if (/limit|last active Owner|cannot|required|not allowed|forbidden/i.test(message)) return denied(409, message);
    return denied(403, message);
  }
}
