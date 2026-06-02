import { Hono, type Context } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import {
  mailMessageRequestSchema,
  mailProviderConfigureSchema,
  mailProviderTestRequestSchema,
  type MailProviderConfigure,
} from "@v2/mail-contracts";
import type {
  PluginBundle,
  PublicContributionAccess,
} from "@v2/plugin-contracts";
import { assessPluginBundle, unpackPluginZip } from "@v2/plugin-installer";
import {
  approvalRequestDecisionRequestSchema,
  capabilityGrantRequestSchema,
  layoutWriteRequestSchema,
  pluginActivationRequestSchema,
  pluginInstallRequestSchema,
  settingScopeSchema,
  settingWriteRequestSchema,
  toolApprovalDecisionRequestSchema,
  toolApprovalLookupRequestSchema,
  toolExecutionRequestSchema,
  type SettingScope,
} from "@v2/rpc-contracts";
import { RuntimeKernel } from "@v2/runtime";
import {
  declarativePageContributionSchema,
  runtimeActionRequestSchema,
  runtimeDataRequestSchema,
} from "@v2/ui-schema";
import {
  allowedOrigins,
  isInternalRequest,
  isPlatformAdmin,
  readSession,
  type CoreSessionUser,
} from "./access";
import { ApprovalRequestRepository } from "./approval-requests";
import type { CoreEnv } from "./env";
import {
  CoreRepository,
  type PluginRuntimeDeployment,
  type PublicationKind,
  type WorkspacePermission,
} from "./repository";
import { platformAccountRuntimeData } from "./platform-account-runtime";
import {
  platformSettingsRuntimeAction,
  platformSettingsRuntimeData,
} from "./platform-settings-runtime";
import { ToolApprovalRepository } from "./tool-approvals";
export type { CoreApi } from "./core-api-contract";

type CoreVariables = { user: CoreSessionUser | null; internal: boolean };
type CoreBindings = { Bindings: CoreEnv; Variables: CoreVariables };
type CoreContext = Context<CoreBindings>;
const app = new Hono<CoreBindings>();
const defaultWorkspaceId = "default";
const readResponseCache = new Map<
  string,
  {
    expiresAt: number;
    status: number;
    headers: [string, string][];
    body: string;
  }
>();
const READ_RESPONSE_CACHE_TTL_MS = 5_000;
function isCacheableRead(path: string) {
  return (
    /\/workspaces\/[^/]+\/bootstrap$/.test(path) ||
    /\/workspaces\/current\/bootstrap$/.test(path) ||
    /\/workspaces\/[^/]+\/auth\/security-bootstrap$/.test(path) ||
    /\/workspaces\/[^/]+\/settings\/tabs$/.test(path) ||
    /\/workspaces\/[^/]+\/settings\/general$/.test(path)
  );
}
function serverTiming(start: number) {
  const total = Math.max(0, performance.now() - start);
  return [
    `total;dur=${total.toFixed(1)}`,
    "cors;dur=0.0",
    "session_validation;dur=0.0",
    "auth_service_binding;dur=0.0",
    "permission_lookup;dur=0.0",
    "workspace_lookup;dur=0.0",
    "d1_queries;dur=0.0",
    "runtime_manifest_parse;dur=0.0",
    "serialization;dur=0.0",
  ].join(", ");
}
async function coreCorsOrigin(c: CoreContext, origin: string) {
  if (!origin) return "";
  if (
    c.env.ENVIRONMENT !== "production" &&
    allowedOrigins(c.env).includes(origin)
  )
    return origin;
  const workspaceId =
    c.req.query("workspaceId") ??
    c.req.param("workspaceId") ??
    new URL(c.req.url).pathname.match(
      /^\/(?:public|workspaces)\/([^/]+)/,
    )?.[1] ??
    defaultWorkspaceId;
  const domains = await new CoreRepository(c.env.CORE_DB).activeDomains(
    workspaceId,
    ["admin", "auth", "website", "storefront", "public-chat"],
  );
  return domains.some((domain) => `https://${domain.hostname}` === origin)
    ? origin
    : "";
}
app.use("*", async (c, next) => {
  const timingStart = performance.now();
  try {
    await next();
  } finally {
    if (
      c.env.ENVIRONMENT !== "production" ||
      c.req.header("x-v2-server-timing") === "1"
    )
      c.header("Server-Timing", serverTiming(timingStart));
  }
});
app.use("*", async (c, next) => {
  const origin = c.req.header("origin") ?? "";
  const allowed = await coreCorsOrigin(c, origin);
  if (allowed) {
    c.header("Access-Control-Allow-Origin", allowed);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Vary", "Origin");
  }
  c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  c.header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  c.header("Access-Control-Max-Age", "600");
  if (c.req.method === "OPTIONS") return c.body(null, allowed ? 204 : 403);
  await next();
});
app.use("*", async (c, next) => {
  const internal = isInternalRequest(c.req.raw);
  const systemInternal = internal && c.req.path.startsWith("/internal/");
  c.set("internal", internal);
  c.set(
    "user",
    c.req.path === "/health" || systemInternal
      ? null
      : await readSession(c.env, c.req.raw.headers),
  );
  await next();
});
app.use("*", async (c, next) => {
  const user = c.get("user");
  if (c.req.method !== "GET" || !user || !isCacheableRead(c.req.path)) {
    await next();
    return;
  }
  const key = `${user.id}:${new URL(c.req.url).pathname}?${new URL(c.req.url).searchParams.toString()}`;
  const now = Date.now();
  const cached = readResponseCache.get(key);
  if (cached && cached.expiresAt > now)
    return new Response(cached.body, {
      status: cached.status,
      headers: cached.headers,
    });
  if (cached) readResponseCache.delete(key);
  await next();
  if (!c.res.ok) return;
  const clone = c.res.clone();
  const body = await clone.text();
  if (readResponseCache.size > 512) readResponseCache.clear();
  readResponseCache.set(key, {
    expiresAt: now + READ_RESPONSE_CACHE_TTL_MS,
    status: clone.status,
    headers: [...clone.headers.entries()],
    body,
  });
});
app.use("*", async (c, next) => {
  await next();
  if (c.req.method !== "GET" && c.res.ok) readResponseCache.clear();
});
app.onError((error, c) => {
  const validation = error instanceof Error && error.name === "ZodError";
  return c.json(
    errorResponse(
      failure(
        validation ? "validation_failed" : "internal_error",
        validation
          ? "Request validation failed."
          : "An unexpected error occurred.",
      ),
    ),
    validation ? 400 : 500,
  );
});
function requireRead(c: CoreContext): Response | undefined {
  return c.get("user")
    ? undefined
    : c.json(
        errorResponse(
          failure("not_authenticated", "Authentication is required."),
        ),
        401,
      );
}
function requireAdmin(c: CoreContext): Response | undefined {
  return isPlatformAdmin(c.env, c.get("user"))
    ? undefined
    : c.json(
        errorResponse(
          failure(
            "not_authorized",
            "Platform administrator permission is required.",
          ),
        ),
        403,
      );
}
async function requirePermission(
  c: CoreContext,
  workspaceId: string,
  permission: WorkspacePermission,
): Promise<Response | undefined> {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  if (isPlatformAdmin(c.env, c.get("user"))) return undefined;
  const repo = new CoreRepository(c.env.CORE_DB);
  const user = c.get("user");
  return (await repo.hasPermission(workspaceId, user, permission))
    ? undefined
    : c.json(
        errorResponse(
          failure("not_authorized", `${permission} permission is required.`),
        ),
        403,
      );
}
async function requireAnyPermission(
  c: CoreContext,
  workspaceId: string,
  permissions: WorkspacePermission[],
): Promise<Response | undefined> {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  if (isPlatformAdmin(c.env, c.get("user"))) return undefined;
  const repo = new CoreRepository(c.env.CORE_DB);
  const user = c.get("user");
  for (const permission of permissions)
    if (await repo.hasPermission(workspaceId, user, permission))
      return undefined;
  return c.json(
    errorResponse(
      failure(
        "not_authorized",
        `${permissions.join(" or ")} permission is required.`,
      ),
    ),
    403,
  );
}
async function requireAllPermissions(
  c: CoreContext,
  workspaceId: string,
  permissions: WorkspacePermission[],
): Promise<Response | undefined> {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  if (isPlatformAdmin(c.env, c.get("user"))) return undefined;
  const repo = new CoreRepository(c.env.CORE_DB);
  return (await repo.hasAllPermissions(workspaceId, c.get("user"), permissions))
    ? undefined
    : c.json(
        errorResponse(
          failure(
            "not_authorized",
            `${permissions.join(", ") || "workspace.read"} permission is required.`,
          ),
        ),
        403,
      );
}
async function runtimeFor(repo: CoreRepository) {
  const runtime = new RuntimeKernel();
  for (const manifest of await repo.installed())
    await runtime.registerPlugin(manifest);
  return runtime;
}
function publicPublicationRequest(input: unknown): {
  workspaceId: string;
  pluginId: string;
  contributionKind: PublicationKind;
  contributionId: string;
  publicPath?: string;
  title?: string;
  access?: PublicContributionAccess;
} | null {
  const value = input as Record<string, unknown>;
  const contributionKind = value.contributionKind;
  const access = value.access;
  const publicPath = value.publicPath;
  if (
    typeof value.workspaceId !== "string" ||
    typeof value.pluginId !== "string" ||
    typeof value.contributionId !== "string"
  )
    return null;
  if (
    contributionKind !== "route" &&
    contributionKind !== "surface" &&
    contributionKind !== "tool"
  )
    return null;
  if (
    access !== undefined &&
    access !== "anonymous" &&
    access !== "authenticated"
  )
    return null;
  if (
    publicPath !== undefined &&
    (typeof publicPath !== "string" ||
      !/^\/$|^\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*)(?:\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*))*$/.test(
        publicPath,
      ))
  )
    return null;
  if (value.title !== undefined && typeof value.title !== "string") return null;
  return {
    workspaceId: value.workspaceId,
    pluginId: value.pluginId,
    contributionKind,
    contributionId: value.contributionId,
    ...(publicPath ? { publicPath } : {}),
    ...(value.title ? { title: value.title } : {}),
    ...(access ? { access } : {}),
  };
}
type DomainInput = {
  hostname: string;
  kind: "admin" | "auth" | "website" | "storefront" | "public-chat" | "mail";
  verificationMethod: "manual" | "dns-txt" | "dns-cname";
  isPrimary?: boolean;
};
function domainInput(input: unknown): DomainInput | null {
  const value = input as Record<string, unknown>;
  const hostname =
    typeof value.hostname === "string"
      ? value.hostname.trim().toLowerCase()
      : "";
  const kind = value.kind;
  const method = value.verificationMethod;
  if (!/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(hostname)) return null;
  if (
    kind !== "admin" &&
    kind !== "auth" &&
    kind !== "website" &&
    kind !== "storefront" &&
    kind !== "public-chat" &&
    kind !== "mail"
  )
    return null;
  if (method !== "manual" && method !== "dns-txt" && method !== "dns-cname")
    return null;
  return {
    hostname,
    kind,
    verificationMethod: method,
    ...(value.isPrimary === true ? { isPrimary: true } : {}),
  };
}
async function verifyDnsDomain(domain: {
  hostname: string;
  verificationMethod: "manual" | "dns-txt" | "dns-cname";
  verificationInstructions: Record<string, unknown> | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (domain.verificationMethod === "manual")
    return {
      ok: false,
      error: "Manual verification requires an explicit audited recovery path.",
    };
  const record =
    domain.verificationMethod === "dns-cname"
      ? typeof domain.verificationInstructions?.cnameRecord === "string"
        ? domain.verificationInstructions.cnameRecord
        : `_v2-verify.${domain.hostname}`
      : typeof domain.verificationInstructions?.txtRecord === "string"
        ? domain.verificationInstructions.txtRecord
        : `_v2-verify.${domain.hostname}`;
  const expected =
    domain.verificationMethod === "dns-cname"
      ? typeof domain.verificationInstructions?.target === "string"
        ? domain.verificationInstructions.target.toLowerCase()
        : ""
      : typeof domain.verificationInstructions?.token === "string"
        ? domain.verificationInstructions.token.toLowerCase()
        : "";
  if (!expected)
    return { ok: false, error: "Domain verification target is missing." };
  const type = domain.verificationMethod === "dns-cname" ? "CNAME" : "TXT";
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(record)}&type=${type}`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!response.ok)
    return { ok: false, error: "DNS verification lookup failed." };
  const body = (await response.json()) as { Answer?: Array<{ data?: string }> };
  const answers = (body.Answer ?? []).map((answer) =>
    String(answer.data ?? "")
      .replaceAll('"', "")
      .toLowerCase(),
  );
  return answers.some((answer) => answer.includes(expected))
    ? { ok: true }
    : { ok: false, error: "Expected DNS verification record was not found." };
}
async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
function firstOrigin(input?: string) {
  return (
    (input ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)[0] ?? ""
  );
}
async function readApprovalId(c: CoreContext): Promise<string | undefined> {
  if (!c.req.header("content-type")?.includes("application/json"))
    return undefined;
  try {
    const body = (await c.req.json()) as { approvalId?: unknown };
    return typeof body.approvalId === "string" ? body.approvalId : undefined;
  } catch {
    return undefined;
  }
}
function pluginInstallSubject(bundle: PluginBundle) {
  return `${bundle.manifest.id}@${bundle.manifest.version}:${bundle.package.sha256}`;
}
function pluginInstallRisk(assessment: ReturnType<typeof assessPluginBundle>) {
  return assessment.bundle.manifest.capabilities.some(
    (item) => item.risk === "dangerous",
  ) || assessment.bundle.worker.isolation === "platform-worker"
    ? "dangerous"
    : "sensitive";
}
function pluginInstallApprovalPayload(
  source: "marketplace" | "upload" | "direct",
  assessment: ReturnType<typeof assessPluginBundle>,
  extra: Record<string, unknown> = {},
) {
  return {
    source,
    pluginId: assessment.bundle.manifest.id,
    version: assessment.bundle.manifest.version,
    sha256: assessment.bundle.package.sha256,
    packageObjectKey: assessment.bundle.package.objectKey,
    sensitiveCapabilities: assessment.sensitiveCapabilities,
    bundle: assessment.bundle,
    ...extra,
  };
}
function staticDataFor(
  pageData: Record<string, unknown>,
  dataSourceId: string,
  resource?: string,
) {
  return resource ? pageData[resource] : (pageData[dataSourceId] ?? pageData);
}
function runtimeUnavailable(
  message = "Plugin runtime is not deployed in the dispatch namespace.",
) {
  return {
    status: "unavailable" as const,
    data: null,
    error: message,
    approvalId: null,
    auditEventId: null,
  };
}
function pluginOperationEnvelope(
  status: "ok" | "denied" | "approval-required" | "unavailable",
  data: unknown = null,
  error: string | null = null,
  approvalId: string | null = null,
  auditEventId: string | null = null,
) {
  return { status, data, error, approvalId, auditEventId };
}
async function pluginRuntimeDispatch(
  c: CoreContext,
  request: {
    workspaceId: string;
    pluginId: string;
    runtimeKey: string;
    kind: "tool" | "action" | "data" | "operation";
    operationId: string;
    contributionId?: string | undefined;
    input?: unknown;
    routeParams?: Record<string, string> | undefined;
    queryParams?: Record<string, string | string[]> | undefined;
  },
) {
  if (!c.env.PLUGIN_RUNTIME) return null;
  const response = await c.env.PLUGIN_RUNTIME.fetch(
    "https://plugin-runtime.internal/dispatch",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  const body = await response.json().catch(() => null);
  return { response, body };
}
async function activeRuntimeOrAudit(
  repo: CoreRepository,
  workspaceId: string,
  pluginId: string,
  action: string,
  actorId?: string,
) {
  const deployment = await repo.activePluginRuntime(workspaceId, pluginId);
  if (!deployment) {
    await repo.audit(
      workspaceId,
      `${action}.unavailable`,
      { pluginId },
      actorId,
    );
    return null;
  }
  return deployment;
}
async function provisionPluginRuntime(
  c: CoreContext,
  repo: CoreRepository,
  workspaceId: string,
  pluginId: string,
  releaseId: string,
  bundle: ReturnType<typeof assessPluginBundle>["bundle"],
) {
  const runtimeKey = `${workspaceId}-${pluginId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 63);
  const localDeployment = {
    workspaceId,
    pluginId,
    releaseId,
    runtimeKey,
    runtimeKind: "local-dev" as const,
    runtimeStatus: "provisioning" as const,
    deployedVersion: bundle.manifest.version,
    deploymentId: null as string | null,
    lastError: null as string | null,
  };
  await repo.upsertPluginRuntimeDeployment(localDeployment);
  if (!c.env.PLATFORM_PROVISIONER) {
    await repo.upsertPluginRuntimeDeployment({
      ...localDeployment,
      runtimeStatus: "deployed",
    });
    return {
      ok: true as const,
      runtimeKey,
      runtimeKind: "local-dev" as const,
      deploymentId: `local-dev:${workspaceId}:${pluginId}:${releaseId}`,
    };
  }
  const response = await c.env.PLATFORM_PROVISIONER.fetch(
    "https://platform-provisioner.internal/internal/plugin-runtimes/provision",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(c.env.PROVISIONING_SECRET
          ? { "x-v2-provisioner-secret": c.env.PROVISIONING_SECRET }
          : {}),
      },
      body: JSON.stringify({
        workspaceId,
        pluginId,
        releaseId,
        version: bundle.manifest.version,
        resources: [],
        worker: { isolation: bundle.worker.isolation },
      }),
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    status?: string;
    runtimeKey?: string;
    runtimeKind?: "dispatch-namespace" | "local-dev";
    deploymentId?: string;
    deployedVersion?: string;
    error?: { message?: string };
  } | null;
  if (!response.ok || payload?.status !== "deployed") {
    await repo.upsertPluginRuntimeDeployment({
      ...localDeployment,
      runtimeStatus: "failed",
      lastError:
        payload?.error?.message ??
        `Runtime provisioning failed: ${response.status}`,
    });
    return {
      ok: false as const,
      errorSafe:
        payload?.error?.message ??
        `Runtime provisioning failed: ${response.status}`,
    };
  }
  await repo.upsertPluginRuntimeDeployment({
    workspaceId,
    pluginId,
    releaseId,
    runtimeKey: payload.runtimeKey ?? runtimeKey,
    runtimeKind: payload.runtimeKind ?? "dispatch-namespace",
    runtimeStatus: "deployed",
    deployedVersion: payload.deployedVersion ?? bundle.manifest.version,
    deploymentId: payload.deploymentId ?? null,
    lastError: null,
  });
  return {
    ok: true as const,
    runtimeKey: payload.runtimeKey ?? runtimeKey,
    runtimeKind: payload.runtimeKind ?? "dispatch-namespace",
    deploymentId: payload.deploymentId ?? null,
  };
}

async function installMarketplacePluginFromSettings(
  c: CoreContext,
  repo: CoreRepository,
  workspaceId: string,
  pluginId: string,
  releaseId?: string,
  approvalId?: string,
  provisioningTarget?: string | null,
) {
  const approvals = new ApprovalRequestRepository(c.env.CORE_DB);
  const plugin = await repo.catalogPlugin(pluginId);
  if (!plugin)
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Marketplace plugin is not available.",
      ),
      404,
    );
  const release = releaseId
    ? await repo.catalogRelease(plugin.manifest.id, releaseId)
    : await repo.publishedCatalogRelease(plugin.manifest.id);
  if (!release)
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Marketplace plugin has no published runtime release.",
      ),
      404,
    );
  let assessment = assessPluginBundle(repo.releaseBundle(release));
  let consumedApprovalId: string | undefined;
  if (assessment.requiresApproval) {
    if (!approvalId) {
      await repo.ensureWorkspace(workspaceId);
      const approval = await approvals.create({
        workspaceId,
        kind: "plugin_install",
        subjectId: release.id,
        pluginId: assessment.bundle.manifest.id,
        risk: pluginInstallRisk(assessment),
        payload: pluginInstallApprovalPayload("marketplace", assessment, {
          releaseId: release.id,
          provisioningTarget: provisioningTarget ?? null,
        }),
        requestedBy: c.get("user")?.id,
      });
      await repo.audit(
        workspaceId,
        "plugin.install.approval.requested",
        {
          approvalId: approval.id,
          pluginId: assessment.bundle.manifest.id,
          releaseId: release.id,
          sha256: release.sha256,
          sensitiveCapabilities: assessment.sensitiveCapabilities,
          provisioningTarget: provisioningTarget ?? null,
        },
        c.get("user")?.id,
      );
      return c.json(
        pluginOperationEnvelope("approval-required", null, null, approval.id),
        202,
      );
    }
    const approved = await approvals.claimApproved({
      workspaceId,
      approvalId,
      kind: "plugin_install",
      subjectId: release.id,
      pluginId: assessment.bundle.manifest.id,
    });
    if (!approved)
      return c.json(
        pluginOperationEnvelope(
          "denied",
          null,
          "A matching approved installation request is required.",
        ),
        403,
      );
    assessment = assessPluginBundle(
      (approved.payload as { bundle?: unknown }).bundle,
    );
    consumedApprovalId = approved.id;
  }
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  await repo.audit(
    workspaceId,
    "plugin.runtime.provisioning",
    {
      pluginId: assessment.bundle.manifest.id,
      releaseId: release.id,
      category: plugin.category,
      provisioningTarget: provisioningTarget ?? null,
    },
    c.get("user")?.id,
  );
  const deployed = await provisionPluginRuntime(
    c,
    repo,
    workspaceId,
    assessment.bundle.manifest.id,
    release.id,
    assessment.bundle,
  );
  if (!deployed.ok)
    return c.json(
      pluginOperationEnvelope("unavailable", null, deployed.errorSafe),
      502,
    );
  await repo.activate(workspaceId, assessment.bundle.manifest.id);
  if (consumedApprovalId) await approvals.consume(consumedApprovalId);
  await repo.audit(
    workspaceId,
    "marketplace.plugin.install",
    {
      pluginId: assessment.bundle.manifest.id,
      category: plugin.category,
      releaseId: release.id,
      approvalId: consumedApprovalId ?? null,
      provisioningTarget: provisioningTarget ?? null,
    },
    c.get("user")?.id,
  );
  return c.json(
    pluginOperationEnvelope("ok", {
      plugin: {
        ...plugin,
        manifest: assessment.bundle.manifest,
        installed: true,
        active: true,
      },
    }),
  );
}
async function runtimePage(
  c: CoreContext,
  repo: CoreRepository,
  workspaceId: string,
  contributionId: string,
) {
  const resolved = await repo.runtimePage(workspaceId, contributionId);
  if (!resolved)
    return c.json(
      errorResponse(failure("not_found", "Interface page is not available.")),
      404,
    );
  const denied = await requirePermission(
    c,
    workspaceId,
    resolved.contribution.requiredPermission ?? "workspace.read",
  );
  if (denied) return denied;
  if (contributionId === "platform.account") {
    const page = declarativePageContributionSchema.parse({
      ...resolved.page,
      templateId: "account.profile",
      data: {
        ...resolved.page.data,
        ...(await platformAccountRuntimeData(c, repo, workspaceId, (path) =>
          authInternalJson(c, path),
        )),
      },
    });
    return c.json({ ...resolved, page });
  }
  return c.json(resolved);
}
async function dispatchPluginOperation(
  c: CoreContext,
  request: {
    workspaceId: string;
    pluginId: string;
    operationId: string;
    input?: unknown;
    routeParams?: Record<string, string>;
    queryParams?: Record<string, string | string[]>;
  },
) {
  const repo = new CoreRepository(c.env.CORE_DB);
  const manifest = await repo.installedById(request.pluginId);
  if (!manifest)
    return c.json(
      errorResponse(failure("not_found", "Plugin is not installed.")),
      404,
    );
  const operation = manifest.api.operations.find(
    (item) => item.id === request.operationId,
  );
  if (!operation)
    return c.json(
      errorResponse(
        failure(
          "not_found",
          "Plugin operation is not declared by the manifest.",
        ),
      ),
      404,
    );
  const denied = await requirePermission(
    c,
    request.workspaceId,
    (operation.permission ?? "workspace.read") as WorkspacePermission,
  );
  if (denied) return denied;
  const deployment = await activeRuntimeOrAudit(
    repo,
    request.workspaceId,
    request.pluginId,
    "plugin.operation",
    c.get("user")?.id,
  );
  if (!deployment)
    return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, {
    workspaceId: request.workspaceId,
    pluginId: request.pluginId,
    runtimeKey: deployment.runtimeKey,
    kind: "operation",
    operationId: request.operationId,
    input: request.input,
    ...(request.routeParams ? { routeParams: request.routeParams } : {}),
    ...(request.queryParams ? { queryParams: request.queryParams } : {}),
  });
  if (!runtimeResult) return c.json(runtimeUnavailable(), 501);
  if (!runtimeResult.response.ok)
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Plugin runtime rejected the operation.",
      ),
      runtimeResult.response.status === 404 ? 404 : 403,
    );
  await repo.audit(
    request.workspaceId,
    "plugin.operation.execute",
    {
      pluginId: request.pluginId,
      operationId: request.operationId,
      runtimeKey: deployment.runtimeKey,
    },
    c.get("user")?.id,
  );
  return c.json(pluginOperationEnvelope("ok", runtimeResult.body));
}
async function workspaceBootstrap(
  c: CoreContext,
  requestedWorkspaceId?: string,
) {
  const denied = requireRead(c);
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB, c.env);
  const user = c.get("user");
  const workspaces = await repo.accessibleWorkspaces(user);
  const currentWorkspace =
    (requestedWorkspaceId
      ? workspaces.find((workspace) => workspace.id === requestedWorkspaceId)
      : null) ??
    workspaces[0] ??
    null;
  if (!currentWorkspace)
    return c.json(
      errorResponse(
        failure(
          "not_authorized",
          "No active workspace membership is available for this account.",
        ),
      ),
      403,
    );
  if (requestedWorkspaceId && currentWorkspace.id !== requestedWorkspaceId)
    return c.json(
      errorResponse(
        failure(
          "not_authorized",
          "This account is not a member of the requested workspace.",
        ),
      ),
      403,
    );
  const workspaceId = currentWorkspace.id;
  const permissions = new Set(currentWorkspace.permissions);
  const membership = await repo.memberSummary(workspaceId, user);
  const theme = await repo.themeSettings(workspaceId);
  return c.json({
    session: {
      authenticated: true,
      impersonated: Boolean(user?.impersonatedBy),
      isAdmin: isPlatformAdmin(c.env, user),
      isSuperadmin: isPlatformAdmin(c.env, user),
      user: user
        ? { id: user.id, email: user.email, name: user.name ?? null }
        : null,
    },
    workspaces,
    currentWorkspace,
    membership,
    layout: (await repo.getLayout(workspaceId)) ?? null,
    routes: { account: "/account", settings: "/settings" },
    navigation: await repo.navigation(workspaceId, permissions),
    featureAvailability: {
      canReadMarketplace:
        permissions.has("marketplace.read") ||
        permissions.has("workspace.admin"),
      canInstallPlugins:
        permissions.has("plugin.install") || permissions.has("workspace.admin"),
      canActivatePlugins:
        permissions.has("plugin.activate") ||
        permissions.has("workspace.admin"),
      canUploadPlugins:
        permissions.has("plugin.install") || permissions.has("workspace.admin"),
    },
    theme,
  });
}
async function runtimeUiBootstrapPayload(c: CoreContext, workspaceId?: string) {
  const denied = requireRead(c);
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB, c.env);
  const requestedWorkspaceId =
    workspaceId && workspaceId !== "current" ? workspaceId : undefined;
  const workspaces = await repo.accessibleWorkspaces(c.get("user"));
  const currentWorkspace =
    (requestedWorkspaceId
      ? workspaces.find((workspace) => workspace.id === requestedWorkspaceId)
      : null) ??
    workspaces[0] ??
    null;
  if (!currentWorkspace)
    return c.json(
      errorResponse(
        failure(
          "not_authorized",
          "No active workspace membership is available for this account.",
        ),
      ),
      403,
    );
  const installed = await repo.workspaceInstalled(currentWorkspace.id);
  const activeIds = await repo.activePlugins(currentWorkspace.id);
  const runtime = await runtimeFor(repo);
  for (const manifest of installed) await runtime.registerPlugin(manifest);
  const active = new Set(activeIds);
  return c.json({
    plugins: installed,
    active: activeIds,
    tools: runtime.plugins
      .all()
      .filter((plugin) => active.has(plugin.id))
      .flatMap((plugin) => plugin.contributes.tools),
    surfaces: (await repo.workspaceUiSurfaces(currentWorkspace.id)).filter(
      (surface) => !surface.id.startsWith("platform.settings."),
    ),
  });
}
async function setupOwnerStatus(c: CoreContext) {
  const token = c.req.query("token");
  if (!token || token.length < 24)
    return c.json(
      errorResponse(failure("not_found", "Owner setup link is not available.")),
      404,
    );
  const status = await new CoreRepository(
    c.env.CORE_DB,
  ).ownerProvisioningStatus(await sha256Hex(token));
  if (!status)
    return c.json(
      errorResponse(failure("not_found", "Owner setup link is not available.")),
      404,
    );
  return c.json({
    setup: {
      workspaceId: status.workspaceId,
      ownerEmail: status.ownerEmail,
      status: status.status,
      expiresAt: status.expiresAt,
    },
  });
}
async function consumeOwnerSetup(c: CoreContext, internal = false) {
  const body = (await c.req.json().catch(() => null)) as {
    token?: unknown;
    user?: { id?: unknown; email?: unknown; name?: unknown };
  } | null;
  const token = typeof body?.token === "string" ? body.token : "";
  const rawUser = body?.user;
  const user =
    rawUser &&
    typeof rawUser.id === "string" &&
    typeof rawUser.email === "string"
      ? {
          id: rawUser.id,
          email: rawUser.email,
          ...(typeof rawUser.name === "string" ? { name: rawUser.name } : {}),
        }
      : null;
  if (token.length < 24 || (!internal && !user))
    return c.json(
      errorResponse(
        failure(
          "validation_failed",
          "A valid owner setup token and user are required.",
        ),
      ),
      400,
    );
  const result = await new CoreRepository(
    c.env.CORE_DB,
  ).consumeOwnerProvisioningToken(await sha256Hex(token), user);
  if (result.status === "consumed" && "workspaceId" in result)
    return c.json(result);
  const code =
    result.status === "not_authenticated"
      ? "not_authenticated"
      : result.status === "email_mismatch"
        ? "not_authorized"
        : result.status === "not_found"
          ? "not_found"
          : "conflict";
  return c.json(
    errorResponse(failure(code, "Owner setup link cannot be consumed.")),
    code === "not_authenticated"
      ? 401
      : code === "not_authorized"
        ? 403
        : code === "not_found"
          ? 404
          : 409,
  );
}
async function authAdminJson<T>(
  c: CoreContext,
  path: string,
  init?: { method?: string; headers?: HeadersInit; body?: string },
): Promise<T> {
  const headers = new Headers(init?.headers);
  const cookie = c.req.header("cookie");
  const authorization = c.req.header("authorization");
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  if (init?.body !== undefined) headers.set("content-type", "application/json");
  const request = {
    headers,
    ...(init?.method ? { method: init.method } : {}),
    ...(init?.body !== undefined ? { body: init.body } : {}),
  };
  const response = await c.env.AUTH.fetch(
    `https://auth.internal${path}`,
    request,
  );
  if (!response.ok)
    throw new Error(`Auth administration failed: ${response.status}`);
  return response.json() as Promise<T>;
}
async function authForwardResponse(
  c: CoreContext,
  path: string,
  init?: { method?: string; body?: string },
): Promise<Response> {
  const headers = new Headers();
  const cookie = c.req.header("cookie");
  const authorization = c.req.header("authorization");
  const origin = c.req.header("origin");
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  if (origin) headers.set("origin", origin);
  if (init?.body !== undefined) headers.set("content-type", "application/json");
  return (await c.env.AUTH.fetch(`https://auth.internal${path}`, {
    headers,
    ...(init?.method ? { method: init.method } : {}),
    ...(init?.body !== undefined ? { body: init.body } : {}),
  })) as unknown as Response;
}
async function authInternalJson<T>(c: CoreContext, path: string): Promise<T> {
  const headers = new Headers();
  const cookie = c.req.header("cookie");
  const authorization = c.req.header("authorization");
  if (cookie) headers.set("cookie", cookie);
  if (authorization) headers.set("authorization", authorization);
  const response = await c.env.AUTH.fetch(`https://auth.internal${path}`, {
    method: "GET",
    headers,
  });
  if (!response.ok)
    throw new Error(`Auth internal lookup failed: ${response.status}`);
  return response.json() as Promise<T>;
}
app.get("/health", (c) => c.json({ ok: true, service: "core-worker" }));
app.get("/session", (c) => {
  const user = c.get("user");
  const isSuperadmin = isPlatformAdmin(c.env, user);
  return c.json({
    authenticated: Boolean(user),
    impersonated: Boolean(user?.impersonatedBy),
    isAdmin: isSuperadmin,
    isSuperadmin,
    user: user
      ? { id: user.id, email: user.email, name: user.name ?? null }
      : null,
  });
});
app.get("/session/impersonation", async (c) => {
  const user = c.get("user");
  if (!user)
    return c.json(
      errorResponse(
        failure("not_authenticated", "Authentication is required."),
      ),
      401,
    );
  return c.json(await authAdminJson(c, "/internal/auth/impersonation/current"));
});
app.post("/session/impersonation/stop", async (c) => {
  const user = c.get("user");
  if (!user)
    return c.json(
      errorResponse(
        failure("not_authenticated", "Authentication is required."),
      ),
      401,
    );
  return c.json(
    await authAdminJson(c, "/internal/auth/impersonation/stop", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  );
});
app.get("/bootstrap", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ authenticated: false });
  const workspaceId = c.req.query("workspaceId")?.trim();
  const bootstrapResponse = await workspaceBootstrap(
    c,
    workspaceId === "current" ? undefined : workspaceId,
  );
  if (!bootstrapResponse.ok) return bootstrapResponse;
  return c.json({
    authenticated: true,
    bootstrap: await bootstrapResponse.json(),
  });
});
app.get("/workspaces/current/bootstrap", async (c) => workspaceBootstrap(c));
app.get("/workspaces/:workspaceId/bootstrap", async (c) =>
  workspaceBootstrap(c, c.req.param("workspaceId")),
);
app.delete("/workspaces/:workspaceId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.admin");
  if (denied) return denied;
  const deleted = await new CoreRepository(c.env.CORE_DB).deleteWorkspace(
    workspaceId,
    c.get("user")?.id,
  );
  return deleted
    ? c.body(null, 204)
    : c.json(
        errorResponse(failure("not_found", "Workspace is not available.")),
        404,
      );
});
app.get("/runtime/ui/bootstrap", async (c) =>
  runtimeUiBootstrapPayload(
    c,
    c.req.query("workspaceId") === "current"
      ? undefined
      : (c.req.query("workspaceId") ?? undefined),
  ),
);
app.get("/setup/owner", async (c) => setupOwnerStatus(c));
app.post("/setup/owner/consume", async (c) => consumeOwnerSetup(c));
app.post("/internal/setup/owner/consume", async (c) => {
  if (!c.get("internal"))
    return c.json(
      errorResponse(
        failure(
          "not_authorized",
          "Internal owner setup consumption requires a service binding.",
        ),
      ),
      403,
    );
  return consumeOwnerSetup(c, true);
});
app.get("/runtime/plugins", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  const denied = workspaceId
    ? await requirePermission(c, workspaceId, "workspace.read")
    : requireRead(c);
  if (denied) return denied;
  return c.json({
    plugins: workspaceId
      ? await new CoreRepository(c.env.CORE_DB).workspaceInstalled(workspaceId)
      : await new CoreRepository(c.env.CORE_DB).installed(),
  });
});
app.get("/runtime/tools", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  const denied = workspaceId
    ? await requirePermission(c, workspaceId, "workspace.read")
    : requireRead(c);
  if (denied) return denied;
  if (!workspaceId)
    return c.json(
      errorResponse(failure("validation_failed", "Workspace is required.")),
      400,
    );
  const repo = new CoreRepository(c.env.CORE_DB);
  const runtime = await runtimeFor(repo);
  const active = new Set(await repo.activePlugins(workspaceId));
  return c.json({
    tools: runtime.plugins
      .all()
      .filter((plugin) => active.has(plugin.id))
      .flatMap((plugin) => plugin.contributes.tools),
  });
});
app.get("/runtime/providers", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  const denied = workspaceId
    ? await requirePermission(c, workspaceId, "workspace.read")
    : requireRead(c);
  if (denied) return denied;
  if (!workspaceId)
    return c.json(
      errorResponse(failure("validation_failed", "Workspace is required.")),
      400,
    );
  const repo = new CoreRepository(c.env.CORE_DB);
  const runtime = await runtimeFor(repo);
  const active = new Set(await repo.activePlugins(workspaceId));
  return c.json({
    providers: runtime.plugins
      .all()
      .filter((plugin) => active.has(plugin.id))
      .flatMap((plugin) => plugin.contributes.providers),
  });
});
app.get("/plugins/installed", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  const denied = workspaceId
    ? await requirePermission(c, workspaceId, "workspace.read")
    : requireRead(c);
  if (denied) return denied;
  return c.json({
    plugins: await new CoreRepository(c.env.CORE_DB).installed(),
  });
});
app.get("/workspaces/:workspaceId/plugins", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.read");
  if (denied) return denied;
  return c.json({
    active: await new CoreRepository(c.env.CORE_DB).activePlugins(workspaceId),
  });
});
app.get("/workspaces/:workspaceId/ui/surfaces", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.read");
  if (denied) return denied;
  return c.json({
    surfaces: await new CoreRepository(c.env.CORE_DB).workspaceUiSurfaces(
      workspaceId,
    ),
  });
});
app.get("/workspaces/:workspaceId/runtime/registry", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.read");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const active = new Set(await repo.activePlugins(workspaceId));
  const installed = await repo.workspaceInstalled(workspaceId);
  const runtime = await runtimeFor(repo);
  for (const manifest of installed) await runtime.registerPlugin(manifest);
  const plugins = installed.filter((plugin) => active.has(plugin.id));
  const deployments = await Promise.all(
    installed.map(async (plugin) => ({
      pluginId: plugin.id,
      state:
        (await repo.pluginRuntimeDeployment(workspaceId, plugin.id)) ?? null,
    })),
  );
  return c.json({
    plugins: plugins.map((plugin) => ({
      id: plugin.id,
      name: plugin.name,
      version: plugin.version,
    })),
    tools: plugins.flatMap((plugin) =>
      plugin.contributes.tools.map((tool) => ({
        ...tool,
        pluginId: plugin.id,
        pluginName: plugin.name,
      })),
    ),
    providers: plugins.flatMap((plugin) =>
      plugin.contributes.providers.map((provider) => ({
        ...provider,
        pluginId: plugin.id,
        pluginName: plugin.name,
      })),
    ),
    channels: plugins.flatMap((plugin) =>
      plugin.contributes.channels.map((channel) => ({
        ...channel,
        pluginId: plugin.id,
        pluginName: plugin.name,
      })),
    ),
    deployments,
  });
});
app.get("/runtime/ui/surfaces", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  if (!workspaceId)
    return c.json(
      errorResponse(failure("validation_failed", "Workspace is required.")),
      400,
    );
  const denied = await requirePermission(c, workspaceId, "workspace.read");
  if (denied) return denied;
  return c.json({
    surfaces: await new CoreRepository(c.env.CORE_DB).workspaceUiSurfaces(
      workspaceId,
    ),
  });
});
app.get("/runtime/ui/surfaces/:surfaceId", async (c) => {
  const user = c.get("user");
  if (!user)
    return c.json(
      errorResponse(
        failure("not_authenticated", "Authentication is required."),
      ),
      401,
    );
  const workspaceId = c.req.query("workspaceId")?.trim();
  const surfaceId = c.req.param("surfaceId").trim();
  if (!workspaceId || !surfaceId)
    return c.json(
      errorResponse(
        failure("validation_failed", "Workspace and surface are required."),
      ),
      400,
    );
  const surface = await new CoreRepository(c.env.CORE_DB).resolveSandboxSurface(
    workspaceId,
    surfaceId,
  );
  if (!surface)
    return c.json(
      errorResponse(failure("not_found", "Plugin surface is not available.")),
      404,
    );
  const archive = await c.env.PLUGIN_PACKAGES.get(surface.objectKey);
  if (!archive)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Plugin package asset is unavailable.",
        ),
      ),
      503,
    );
  const { extractDeclaredHtmlAsset } = await import("@v2/plugin-installer");
  const html = extractDeclaredHtmlAsset(
    await archive.arrayBuffer(),
    surface.entry,
  );
  if (!html)
    return c.json(
      errorResponse(
        failure("not_found", "Declared plugin UI asset is not available."),
      ),
      404,
    );
  const policy = `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; frame-ancestors 'self'; base-uri 'none'; object-src 'none'`;
  return c.body(html, 200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "private, no-store",
    "content-security-policy": policy,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "cross-origin-resource-policy": "same-site",
  });
});
app.get("/marketplace/plugins", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  const repo = new CoreRepository(c.env.CORE_DB);
  const catalog = await repo.catalogPlugins();
  if (!workspaceId)
    return c.json({
      plugins: catalog.map((entry) => ({
        ...entry,
        installed: false,
        active: false,
      })),
    });
  const denied = await requirePermission(c, workspaceId, "marketplace.read");
  if (denied) return denied;
  const workspacePlugins = await repo.workspacePlugins(workspaceId);
  const installed = new Set(workspacePlugins.map((plugin) => plugin.pluginId));
  const active = new Set(
    workspacePlugins
      .filter((plugin) => plugin.active)
      .map((plugin) => plugin.pluginId),
  );
  return c.json({
    plugins: catalog.map((entry) => ({
      ...entry,
      installed: installed.has(entry.manifest.id),
      active: active.has(entry.manifest.id),
    })),
  });
});
app.post("/plugins/upload", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  if (!workspaceId)
    return c.json(
      errorResponse(failure("validation_failed", "Workspace is required.")),
      400,
    );
  const denied = await requirePermission(c, workspaceId, "plugin.install");
  if (denied) return denied;
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".zip"))
    return c.json(
      errorResponse(
        failure("validation_failed", "A ZIP plugin package is required."),
      ),
      400,
    );
  if (file.size > 20 * 1024 * 1024)
    return c.json(
      errorResponse(
        failure("validation_failed", "Plugin package exceeds 20 MB."),
      ),
      413,
    );
  const bytes = await file.arrayBuffer();
  const key = `packages/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g, "-")}`;
  const assessment = await unpackPluginZip(bytes, key);
  await c.env.PLUGIN_PACKAGES.put(key, bytes, {
    customMetadata: {
      pluginId: assessment.bundle.manifest.id,
      version: assessment.bundle.manifest.version,
      sha256: assessment.bundle.package.sha256,
    },
  });
  const repo = new CoreRepository(c.env.CORE_DB);
  const approvals = new ApprovalRequestRepository(c.env.CORE_DB);
  const targetWorkspaceId = workspaceId;
  if (assessment.requiresApproval) {
    const approval = await approvals.create({
      workspaceId: targetWorkspaceId,
      kind: "plugin_install",
      subjectId: pluginInstallSubject(assessment.bundle),
      pluginId: assessment.bundle.manifest.id,
      risk: pluginInstallRisk(assessment),
      payload: pluginInstallApprovalPayload("upload", assessment),
      requestedBy: c.get("user")?.id,
    });
    await repo.audit(
      targetWorkspaceId,
      "plugin.install.approval.requested",
      {
        approvalId: approval.id,
        pluginId: assessment.bundle.manifest.id,
        sha256: assessment.bundle.package.sha256,
        source: "zip",
        sensitiveCapabilities: assessment.sensitiveCapabilities,
      },
      c.get("user")?.id,
    );
    return c.json(
      {
        status: "approval-required",
        approvalId: approval.id,
        pluginId: assessment.bundle.manifest.id,
        version: assessment.bundle.manifest.version,
        sha256: assessment.bundle.package.sha256,
        sensitiveCapabilities: assessment.sensitiveCapabilities,
      },
      202,
    );
  }
  await repo.ensureWorkspace(targetWorkspaceId);
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  await repo.audit(
    targetWorkspaceId,
    "plugin.runtime.provisioning",
    { pluginId: assessment.bundle.manifest.id, source: "zip" },
    c.get("user")?.id,
  );
  const deployed = await provisionPluginRuntime(
    c,
    repo,
    targetWorkspaceId,
    assessment.bundle.manifest.id,
    `${assessment.bundle.manifest.id}@${assessment.bundle.manifest.version}`,
    assessment.bundle,
  );
  if (!deployed.ok)
    return c.json(
      errorResponse(
        failure("dependency_unavailable", deployed.errorSafe, {
          retryable: true,
        }),
      ),
      502,
    );
  await repo.activate(targetWorkspaceId, assessment.bundle.manifest.id);
  await repo.audit(
    targetWorkspaceId,
    "plugin.install",
    { pluginId: assessment.bundle.manifest.id, source: "zip" },
    c.get("user")?.id,
  );
  return c.json(
    { status: "installed", manifest: assessment.bundle.manifest },
    201,
  );
});
app.post("/plugins/install", async (c) => {
  const request = pluginInstallRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  const denied = await requirePermission(
    c,
    request.workspaceId,
    "plugin.install",
  );
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const approvals = new ApprovalRequestRepository(c.env.CORE_DB);
  const targetWorkspaceId = request.workspaceId;
  let assessment = request.bundle ? assessPluginBundle(request.bundle) : null;
  let consumedApprovalId: string | undefined;
  if (request.approvalId) {
    const approved = await approvals.claimApproved({
      workspaceId: targetWorkspaceId,
      approvalId: request.approvalId,
      kind: "plugin_install",
    });
    if (!approved)
      return c.json(
        errorResponse(
          failure(
            "not_authorized",
            "A matching approved installation request is required.",
          ),
        ),
        403,
      );
    assessment = assessPluginBundle(
      (approved.payload as { bundle?: unknown }).bundle,
    );
    consumedApprovalId = approved.id;
  }
  if (!assessment)
    return c.json(
      errorResponse(
        failure("validation_failed", "A plugin bundle is required."),
      ),
      400,
    );
  if (assessment.requiresApproval && !consumedApprovalId) {
    await repo.ensureWorkspace(targetWorkspaceId);
    const approval = await approvals.create({
      workspaceId: targetWorkspaceId,
      kind: "plugin_install",
      subjectId: pluginInstallSubject(assessment.bundle),
      pluginId: assessment.bundle.manifest.id,
      risk: pluginInstallRisk(assessment),
      payload: pluginInstallApprovalPayload("direct", assessment),
      requestedBy: c.get("user")?.id,
    });
    await repo.audit(
      targetWorkspaceId,
      "plugin.install.approval.requested",
      {
        approvalId: approval.id,
        pluginId: assessment.bundle.manifest.id,
        sha256: assessment.bundle.package.sha256,
        sensitiveCapabilities: assessment.sensitiveCapabilities,
      },
      c.get("user")?.id,
    );
    return c.json(
      {
        status: "approval-required",
        approvalId: approval.id,
        pluginId: assessment.bundle.manifest.id,
        version: assessment.bundle.manifest.version,
        sha256: assessment.bundle.package.sha256,
        sensitiveCapabilities: assessment.sensitiveCapabilities,
      },
      202,
    );
  }
  await repo.ensureWorkspace(targetWorkspaceId);
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  await repo.audit(
    targetWorkspaceId,
    "plugin.runtime.provisioning",
    { pluginId: assessment.bundle.manifest.id, source: "bundle" },
    c.get("user")?.id,
  );
  const deployed = await provisionPluginRuntime(
    c,
    repo,
    targetWorkspaceId,
    assessment.bundle.manifest.id,
    request.approvalId ??
      `${assessment.bundle.manifest.id}@${assessment.bundle.manifest.version}`,
    assessment.bundle,
  );
  if (!deployed.ok)
    return c.json(
      errorResponse(
        failure("dependency_unavailable", deployed.errorSafe, {
          retryable: true,
        }),
      ),
      502,
    );
  await repo.activate(targetWorkspaceId, assessment.bundle.manifest.id);
  if (consumedApprovalId) await approvals.consume(consumedApprovalId);
  await repo.audit(
    targetWorkspaceId,
    "plugin.install",
    {
      pluginId: assessment.bundle.manifest.id,
      approvalId: consumedApprovalId ?? null,
    },
    c.get("user")?.id,
  );
  return c.json(
    { status: "installed", manifest: assessment.bundle.manifest },
    201,
  );
});
app.post("/marketplace/plugins/:pluginId/install", async (c) => {
  const workspaceId = c.req.query("workspaceId")?.trim();
  if (!workspaceId)
    return c.json(
      errorResponse(failure("validation_failed", "Workspace is required.")),
      400,
    );
  const denied = await requirePermission(c, workspaceId, "plugin.install");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const approvals = new ApprovalRequestRepository(c.env.CORE_DB);
  const plugin = await repo.catalogPlugin(c.req.param("pluginId"));
  if (!plugin)
    return c.json(
      errorResponse(
        failure("not_found", "Marketplace plugin is not available."),
      ),
      404,
    );
  const release = await repo.publishedCatalogRelease(plugin.manifest.id);
  if (!release)
    return c.json(
      errorResponse(
        failure(
          "not_found",
          "Marketplace plugin has no published runtime release.",
        ),
      ),
      404,
    );
  let assessment = assessPluginBundle(repo.releaseBundle(release));
  let consumedApprovalId: string | undefined;
  if (assessment.requiresApproval) {
    const approvalId = await readApprovalId(c);
    if (!approvalId) {
      await repo.ensureWorkspace(workspaceId);
      const approval = await approvals.create({
        workspaceId,
        kind: "plugin_install",
        subjectId: release.id,
        pluginId: assessment.bundle.manifest.id,
        risk: pluginInstallRisk(assessment),
        payload: pluginInstallApprovalPayload("marketplace", assessment, {
          releaseId: release.id,
        }),
        requestedBy: c.get("user")?.id,
      });
      await repo.audit(
        workspaceId,
        "plugin.install.approval.requested",
        {
          approvalId: approval.id,
          pluginId: assessment.bundle.manifest.id,
          releaseId: release.id,
          sha256: release.sha256,
          sensitiveCapabilities: assessment.sensitiveCapabilities,
        },
        c.get("user")?.id,
      );
      return c.json(
        {
          status: "approval-required",
          approvalId: approval.id,
          releaseId: release.id,
          pluginId: assessment.bundle.manifest.id,
          version: release.version,
          sha256: release.sha256,
          sensitiveCapabilities: assessment.sensitiveCapabilities,
        },
        202,
      );
    }
    const approved = await approvals.claimApproved({
      workspaceId,
      approvalId,
      kind: "plugin_install",
      subjectId: release.id,
      pluginId: assessment.bundle.manifest.id,
    });
    if (!approved)
      return c.json(
        errorResponse(
          failure(
            "not_authorized",
            "A matching approved installation request is required.",
          ),
        ),
        403,
      );
    assessment = assessPluginBundle(
      (approved.payload as { bundle?: unknown }).bundle,
    );
    consumedApprovalId = approved.id;
  }
  await repo.installManifest(assessment.bundle.manifest, assessment.bundle);
  await repo.audit(
    workspaceId,
    "plugin.runtime.provisioning",
    {
      pluginId: assessment.bundle.manifest.id,
      releaseId: release.id,
      category: plugin.category,
    },
    c.get("user")?.id,
  );
  const deployed = await provisionPluginRuntime(
    c,
    repo,
    workspaceId,
    assessment.bundle.manifest.id,
    release.id,
    assessment.bundle,
  );
  if (!deployed.ok)
    return c.json(
      errorResponse(
        failure("dependency_unavailable", deployed.errorSafe, {
          retryable: true,
        }),
      ),
      502,
    );
  await repo.activate(workspaceId, assessment.bundle.manifest.id);
  if (consumedApprovalId) await approvals.consume(consumedApprovalId);
  await repo.audit(
    workspaceId,
    "marketplace.plugin.install",
    {
      pluginId: assessment.bundle.manifest.id,
      category: plugin.category,
      releaseId: release.id,
      approvalId: consumedApprovalId ?? null,
    },
    c.get("user")?.id,
  );
  return c.json(
    {
      status: "installed",
      plugin: {
        ...plugin,
        manifest: assessment.bundle.manifest,
        installed: true,
        active: true,
      },
    },
    201,
  );
});
app.post("/plugins/activate", async (c) => {
  const request = pluginActivationRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  const denied = await requirePermission(
    c,
    request.workspaceId,
    "plugin.activate",
  );
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const deployment = await repo.pluginRuntimeDeployment(
    request.workspaceId,
    request.pluginId,
  );
  if (
    !deployment ||
    !["deployed", "active", "disabled"].includes(deployment.runtimeStatus)
  )
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Plugin runtime deployment must be confirmed before activation.",
        ),
      ),
      409,
    );
  const state = await repo.activate(request.workspaceId, request.pluginId);
  return state
    ? c.json(state, 201)
    : c.json(
        errorResponse(failure("not_found", "Plugin is not installed.")),
        404,
      );
});
app.post("/plugins/deactivate", async (c) => {
  const request = pluginActivationRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  const denied = await requirePermission(
    c,
    request.workspaceId,
    "plugin.activate",
  );
  if (denied) return denied;
  const state = await new CoreRepository(c.env.CORE_DB).deactivate(
    request.workspaceId,
    request.pluginId,
  );
  return state
    ? c.json(state)
    : c.json(
        errorResponse(failure("not_found", "Plugin is not installed.")),
        404,
      );
});
app.post("/plugins/grants", async (c) => {
  const request = capabilityGrantRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  const denied = await requirePermission(
    c,
    request.workspaceId,
    "plugin.grantCapability",
  );
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  if (!(await repo.installedById(request.pluginId)))
    return c.json(
      errorResponse(failure("not_found", "Plugin is not installed.")),
      404,
    );
  const declared = new Set(await repo.declaredCapabilities(request.pluginId));
  if (!request.capabilities.every((capability) => declared.has(capability)))
    return c.json(
      errorResponse(
        failure(
          "validation_failed",
          "Capability is not declared by the plugin.",
        ),
      ),
      400,
    );
  return c.json({
    pluginId: request.pluginId,
    capabilities: await repo.grantCapabilities(
      request.workspaceId,
      request.pluginId,
      request.capabilities,
    ),
  });
});
app.post("/tools/execute", async (c) => {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  const request = toolExecutionRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  const repo = new CoreRepository(c.env.CORE_DB);
  const approvals = new ToolApprovalRepository(c.env.CORE_DB);
  const runtime = await runtimeFor(repo);
  const owner = runtime.plugins
    .all()
    .find((plugin) =>
      plugin.contributes.tools.some((tool) => tool.id === request.toolId),
    );
  const tool = runtime.tools.get(request.toolId);
  if (!owner || !tool)
    return c.json(
      {
        status: "denied",
        toolId: request.toolId,
        reason: "Tool not registered",
      },
      404,
    );
  const permissionDenied = await requireAllPermissions(c, request.workspaceId, tool.permissions.length ? (tool.permissions as WorkspacePermission[]) : ["workspace.read"]);
  if (permissionDenied) return permissionDenied;
  const active = new Set(await repo.activePlugins(request.workspaceId));
  if (!active.has(owner.id))
    return c.json(
      {
        status: "denied",
        toolId: tool.id,
        reason: "Plugin is not active in workspace",
      },
      403,
    );
  const permissions = new Set(
    await repo.grantedCapabilities(request.workspaceId, owner.id),
  );
  const initialDecision = runtime.canExecuteTool(tool.id, { permissions });
  if (initialDecision === "deny")
    return c.json(
      {
        status: "denied",
        toolId: tool.id,
        reason: "Capability has not been granted",
      },
      403,
    );
  let executionInput = request.input;
  let consumedApprovalId: string | undefined;
  if (initialDecision === "require-approval") {
    if (!request.approvalId) {
      const approval = await approvals.create(
        request.workspaceId,
        owner.id,
        tool.id,
        tool.risk,
        request.input,
        c.get("user")?.id,
      );
      await repo.audit(
        request.workspaceId,
        "tool.approval.requested",
        { approvalId: approval.id, toolId: tool.id, pluginId: owner.id },
        c.get("user")?.id,
      );
      return c.json(
        {
          status: "approval-required",
          toolId: tool.id,
          risk: tool.risk,
          approvalId: approval.id,
        },
        202,
      );
    }
    const approved = await approvals.approvedInput(
      request.workspaceId,
      request.approvalId,
      owner.id,
      tool.id,
    );
    if (!approved)
      return c.json(
        {
          status: "denied",
          toolId: tool.id,
          reason: "Approval is missing, expired or already consumed",
        },
        403,
      );
    executionInput = approved.input;
    consumedApprovalId = approved.approval.id;
  }
  const deployment = await activeRuntimeOrAudit(
    repo,
    request.workspaceId,
    owner.id,
    "tool.execute",
    c.get("user")?.id,
  );
  if (!deployment) {
    if (consumedApprovalId) await approvals.release(consumedApprovalId);
    return c.json(
      {
        status: "denied",
        toolId: tool.id,
        reason: "Plugin runtime is not active",
      },
      503,
    );
  }
  const runtimeResult = await pluginRuntimeDispatch(c, {
    workspaceId: request.workspaceId,
    pluginId: owner.id,
    runtimeKey: deployment.runtimeKey,
    kind: "tool",
    operationId: tool.id,
    input: executionInput,
  });
  if (runtimeResult) {
    if (!runtimeResult.response.ok) {
      if (consumedApprovalId)
        await (runtimeResult.response.status >= 500
          ? approvals.release(consumedApprovalId)
          : approvals.fail(consumedApprovalId));
      return c.json(
        {
          status: "denied",
          toolId: tool.id,
          reason: "Plugin runtime rejected the operation",
        },
        runtimeResult.response.status === 404 ? 404 : 403,
      );
    }
    if (consumedApprovalId) await approvals.consume(consumedApprovalId);
    await repo.audit(
      request.workspaceId,
      "tool.execute",
      {
        toolId: tool.id,
        pluginId: owner.id,
        approvalId: consumedApprovalId ?? null,
        dispatched: "plugin-runtime",
      },
      c.get("user")?.id,
    );
    return c.json({
      status: "executed",
      toolId: tool.id,
      ...(consumedApprovalId ? { approvalId: consumedApprovalId } : {}),
      result: runtimeResult.body,
    });
  }
  if (consumedApprovalId) await approvals.release(consumedApprovalId);
  await repo.audit(
    request.workspaceId,
    "tool.execute.unavailable",
    {
      toolId: tool.id,
      pluginId: owner.id,
      approvalId: consumedApprovalId ?? null,
    },
    c.get("user")?.id,
  );
  return c.json(
    {
      status: "denied",
      toolId: tool.id,
      reason: "Plugin runtime dispatch is unavailable",
    },
    503,
  );
});
app.get("/workspaces/:workspaceId/tool-approvals", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "approval.read");
  if (denied) return denied;
  return c.json({
    approvals: await new ToolApprovalRepository(c.env.CORE_DB).listPending(
      workspaceId,
    ),
  });
});
app.post("/tool-approvals/decision", async (c) => {
  const request = toolApprovalDecisionRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  const denied = await requirePermission(
    c,
    request.workspaceId,
    "tool.approve",
  );
  if (denied) return denied;
  const approval = await new ToolApprovalRepository(c.env.CORE_DB).decide(
    request.workspaceId,
    request.approvalId,
    request.decision,
    c.get("user")?.id,
  );
  if (!approval)
    return c.json(
      errorResponse(failure("conflict", "Approval is not pending.")),
      409,
    );
  await new CoreRepository(c.env.CORE_DB).audit(
    request.workspaceId,
    `tool.approval.${request.decision}`,
    { approvalId: approval.id, toolId: approval.toolId },
    c.get("user")?.id,
  );
  return c.json({ approval });
});
app.get("/workspaces/:workspaceId/approval-requests", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "approval.read");
  if (denied) return denied;
  return c.json({
    approvals: await new ApprovalRequestRepository(c.env.CORE_DB).listPending(
      workspaceId,
    ),
  });
});
app.post("/approval-requests/:approvalId/decision", async (c) => {
  const request = approvalRequestDecisionRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  const denied = await requirePermission(
    c,
    request.workspaceId,
    "tool.approve",
  );
  if (denied) return denied;
  const approval = await new ApprovalRequestRepository(c.env.CORE_DB).decide(
    request.workspaceId,
    c.req.param("approvalId"),
    request.decision,
    c.get("user")?.id,
    request.reason,
  );
  if (!approval)
    return c.json(
      errorResponse(failure("conflict", "Approval is not pending.")),
      409,
    );
  await new CoreRepository(c.env.CORE_DB).audit(
    request.workspaceId,
    `approval.${request.decision}`,
    {
      approvalId: approval.id,
      kind: approval.kind,
      subjectId: approval.subjectId,
      pluginId: approval.pluginId,
    },
    c.get("user")?.id,
  );
  return c.json({ approval });
});
app.post("/runtime/ui/data", async (c) => {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  const request = runtimeDataRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  const repo = new CoreRepository(c.env.CORE_DB, c.env);
  const resolved = await repo.privateRuntimeContribution(
    request.workspaceId,
    request.contributionId,
  );
  if (!resolved)
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Contribution is not active in this workspace.",
      ),
      403,
    );
  const dataSource = resolved.page.dataSources.find(
    (item) => item.id === request.dataSourceId,
  );
  if (!dataSource)
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Data source is not declared by this contribution.",
      ),
      403,
    );
  const permissionDenied = await requirePermission(c, request.workspaceId, dataSource.access === "permission-gated" || resolved.page.access === "permission-gated" ? (resolved.requiredPermission ?? "workspace.read") : "workspace.read");
  if (permissionDenied) return permissionDenied;
  if (dataSource.kind === "static")
    return c.json({
      status: "ok",
      data: staticDataFor(
        (resolved.page as { data?: Record<string, unknown> }).data ?? {},
        dataSource.id,
        dataSource.resource,
      ),
      error: null,
      approvalId: null,
      auditEventId: null,
    });
  const deployment = await activeRuntimeOrAudit(
    repo,
    request.workspaceId,
    resolved.pluginId,
    "runtime.ui.data",
    c.get("user")?.id,
  );
  if (!deployment)
    return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, {
    workspaceId: request.workspaceId,
    pluginId: resolved.pluginId,
    runtimeKey: deployment.runtimeKey,
    kind: "data",
    operationId: dataSource.resource ?? dataSource.id,
    contributionId: request.contributionId,
    ...(request.routeParams ? { routeParams: request.routeParams } : {}),
    ...(request.queryParams ? { queryParams: request.queryParams } : {}),
  });
  if (runtimeResult) {
    if (!runtimeResult.response.ok)
      return c.json(
        {
          status: "denied",
          data: null,
          error: "Plugin runtime rejected the data request.",
          approvalId: null,
          auditEventId: null,
        },
        runtimeResult.response.status === 404 ? 404 : 403,
      );
    await repo.audit(
      request.workspaceId,
      "runtime.ui.data.execute",
      {
        pluginId: resolved.pluginId,
        contributionId: request.contributionId,
        dataSourceId: dataSource.id,
        dispatched: "plugin-runtime",
      },
      c.get("user")?.id,
    );
    return c.json({
      status: "ok",
      data: runtimeResult.body,
      error: null,
      approvalId: null,
      auditEventId: null,
    });
  }
  await repo.audit(
    request.workspaceId,
    "runtime.ui.data.unavailable",
    {
      pluginId: resolved.pluginId,
      contributionId: request.contributionId,
      dataSourceId: dataSource.id,
    },
    c.get("user")?.id,
  );
  return c.json(runtimeUnavailable(), 501);
});
app.post("/runtime/ui/actions", async (c) => {
  const readDenied = requireRead(c);
  if (readDenied) return readDenied;
  const request = runtimeActionRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  const repo = new CoreRepository(c.env.CORE_DB, c.env);
  const resolved = await repo.privateRuntimeContribution(
    request.workspaceId,
    request.contributionId,
  );
  if (!resolved)
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Contribution is not active in this workspace.",
      ),
      403,
    );
  const action = resolved.page.actions.find(
    (item) => item.id === request.actionId,
  );
  if (!action)
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Action is not declared by this contribution.",
      ),
      403,
    );
  const actionPermissionDenied = await requirePermission(c, request.workspaceId, action.commandId.startsWith("platform.account.") ? "workspace.read" : "workspace.settings.write");
  if (actionPermissionDenied) return actionPermissionDenied;
  if (request.contributionId === "platform.account") {
    if (action.commandId === "platform.account.profile.save") {
      const payload =
        request.input && typeof request.input === "object"
          ? (request.input as { name?: unknown })
          : {};
      const response = await authForwardResponse(c, "/api/auth/update-user", {
        method: "POST",
        body: JSON.stringify({
          name: typeof payload.name === "string" ? payload.name : null,
          language:
            typeof (payload as { language?: unknown }).language === "string"
              ? (payload as { language?: string }).language
              : null,
          location:
            typeof (payload as { location?: unknown }).location === "string"
              ? (payload as { location?: string }).location
              : null,
          timezone:
            typeof (payload as { timezone?: unknown }).timezone === "string"
              ? (payload as { timezone?: string }).timezone
              : null,
        }),
      });
      if (!response.ok)
        return c.json(
          pluginOperationEnvelope("denied", null, "Profile update failed."),
          response.status === 404 ? 404 : 403,
        );
      return c.json(
        pluginOperationEnvelope(
          "ok",
          await platformAccountRuntimeData(
            c,
            repo,
            request.workspaceId,
            (path) => authInternalJson(c, path),
          ),
        ),
      );
    }
    if (action.commandId === "platform.account.sign-out") {
      const response = await authForwardResponse(c, "/api/auth/sign-out", {
        method: "POST",
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) c.header("Set-Cookie", setCookie);
      if (!response.ok)
        return c.json(
          pluginOperationEnvelope("denied", null, "Sign out failed."),
          403,
        );
      return c.json(pluginOperationEnvelope("ok", null));
    }
  }
  const runtime = await runtimeFor(repo);
  const toolOwner = runtime.plugins
    .all()
    .find((plugin) =>
      plugin.contributes.tools.some((tool) => tool.id === action.commandId),
    );
  const tool = toolOwner?.contributes.tools.find(
    (item) => item.id === action.commandId,
  );
  const permissionDenied = await requireAllPermissions(
    c,
    request.workspaceId,
    tool?.permissions.length
      ? (tool.permissions as WorkspacePermission[])
      : [resolved.requiredPermission ?? "workspace.settings.write"],
  );
  if (permissionDenied) return permissionDenied;
  const deployment = await activeRuntimeOrAudit(
    repo,
    request.workspaceId,
    resolved.pluginId,
    "runtime.ui.action",
    c.get("user")?.id,
  );
  if (!deployment)
    return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, {
    workspaceId: request.workspaceId,
    pluginId: resolved.pluginId,
    runtimeKey: deployment.runtimeKey,
    kind: "action",
    operationId: action.commandId,
    contributionId: request.contributionId,
    input: request.input,
    ...(request.routeParams ? { routeParams: request.routeParams } : {}),
  });
  if (runtimeResult) {
    if (!runtimeResult.response.ok)
      return c.json(
        {
          status: "denied",
          data: null,
          error: "Plugin runtime rejected the operation.",
          approvalId: null,
          auditEventId: null,
        },
        runtimeResult.response.status === 404 ? 404 : 403,
      );
    await repo.audit(
      request.workspaceId,
      "runtime.ui.action.execute",
      {
        pluginId: resolved.pluginId,
        contributionId: request.contributionId,
        actionId: action.id,
        commandId: action.commandId,
        dispatched: "plugin-runtime",
      },
      c.get("user")?.id,
    );
    return c.json({
      status: "ok",
      data: runtimeResult.body,
      error: null,
      approvalId: null,
      auditEventId: null,
    });
  }
  await repo.audit(
    request.workspaceId,
    "runtime.ui.action.unavailable",
    {
      pluginId: resolved.pluginId,
      contributionId: request.contributionId,
      actionId: action.id,
      commandId: action.commandId,
    },
    c.get("user")?.id,
  );
  return c.json(runtimeUnavailable(), 501);
});
app.post("/workspaces/:workspaceId/settings/runtime/data", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(
    c,
    workspaceId,
    "workspace.settings.read",
  );
  if (denied) return denied;
  const request = runtimeDataRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  const repo = new CoreRepository(c.env.CORE_DB, c.env);
  const platformPermission =
    request.contributionId === "platform.settings.security"
      ? "auth.read"
      : request.contributionId === "platform.settings.plugins"
        ? "marketplace.read"
        : request.contributionId === "platform.settings.interface"
          ? "interface.read"
          : undefined;
  if (platformPermission) {
    const permissionDenied = await requirePermission(
      c,
      request.workspaceId,
      platformPermission,
    );
    if (permissionDenied) return permissionDenied;
  }
  if (request.contributionId.startsWith("platform.settings.")) {
    const platformData = await platformSettingsRuntimeData(
      c,
      repo,
      request.workspaceId,
      request.dataSourceId,
      {
        authAdminJson: (path, init) => authAdminJson(c, path, init),
        authForwardResponse: (path, init) => authForwardResponse(c, path, init),
        authInternalJson: (path) => authInternalJson(c, path),
      },
    );
    if (platformData !== null)
      return c.json({
        status: "ok",
        data: platformData,
        error: null,
        approvalId: null,
        auditEventId: null,
      });
  }
  const resolved = await repo.privateRuntimeContribution(
    request.workspaceId,
    request.contributionId,
  );
  if (!resolved)
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Contribution is not active in this workspace.",
      ),
      403,
    );
  const section =
    resolved.panel.sections.find(
      (item) => item.dataSourceId === request.dataSourceId,
    ) ??
    resolved.panel.sections.find((item) => item.id === request.dataSourceId);
  if (!section)
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Data source is not declared by this contribution.",
      ),
      403,
    );
  const permissionDenied = await requirePermission(
    c,
    request.workspaceId,
    resolved.requiredPermission ?? "workspace.settings.read",
  );
  if (permissionDenied) return permissionDenied;
  if (
    section.kind === "summary" ||
    section.kind === "table" ||
    section.kind === "form" ||
    section.kind === "crud" ||
    section.kind === "actions"
  )
    return c.json({
      status: "ok",
      data: staticDataFor(
        (resolved.panel.schema as { data?: Record<string, unknown> }).data ??
          {},
        request.dataSourceId,
        section.dataSourceId,
      ),
      error: null,
      approvalId: null,
      auditEventId: null,
    });
  const deployment = await activeRuntimeOrAudit(
    repo,
    request.workspaceId,
    resolved.pluginId,
    "settings.runtime.data",
    c.get("user")?.id,
  );
  if (!deployment)
    return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, {
    workspaceId: request.workspaceId,
    pluginId: resolved.pluginId,
    runtimeKey: deployment.runtimeKey,
    kind: "data",
    operationId: section.dataSourceId ?? section.id,
    contributionId: request.contributionId,
    ...(request.routeParams ? { routeParams: request.routeParams } : {}),
    ...(request.queryParams ? { queryParams: request.queryParams } : {}),
  });
  if (runtimeResult) {
    if (!runtimeResult.response.ok)
      return c.json(
        {
          status: "denied",
          data: null,
          error: "Plugin runtime rejected the data request.",
          approvalId: null,
          auditEventId: null,
        },
        runtimeResult.response.status === 404 ? 404 : 403,
      );
    await repo.audit(
      request.workspaceId,
      "settings.runtime.data.execute",
      {
        pluginId: resolved.pluginId,
        contributionId: request.contributionId,
        dataSourceId: section.dataSourceId ?? section.id,
        dispatched: "plugin-runtime",
      },
      c.get("user")?.id,
    );
    return c.json({
      status: "ok",
      data: runtimeResult.body,
      error: null,
      approvalId: null,
      auditEventId: null,
    });
  }
  await repo.audit(
    request.workspaceId,
    "settings.runtime.data.unavailable",
    {
      pluginId: resolved.pluginId,
      contributionId: request.contributionId,
      dataSourceId: section.dataSourceId ?? section.id,
    },
    c.get("user")?.id,
  );
  return c.json(runtimeUnavailable(), 501);
});
app.post("/workspaces/:workspaceId/settings/runtime/actions", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(
    c,
    workspaceId,
    "workspace.settings.write",
  );
  if (denied) return denied;
  const request = runtimeActionRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  const repo = new CoreRepository(c.env.CORE_DB, c.env);
  const resolved = await repo.privateRuntimeContribution(
    request.workspaceId,
    request.contributionId,
  );
  if (!resolved)
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Contribution is not active in this workspace.",
      ),
      403,
    );
  const action = resolved.panel.sections
    .flatMap((section) => [
      ...section.actions,
      ...section.rowActions,
      ...section.bulkActions,
    ])
    .find((item) => item.id === request.actionId);
  if (!action)
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Action is not declared by this contribution.",
      ),
      403,
    );
  const runtime = await runtimeFor(repo);
  const toolOwner = runtime.plugins
    .all()
    .find((plugin) =>
      plugin.contributes.tools.some((tool) => tool.id === action.commandId),
    );
  const tool = toolOwner?.contributes.tools.find(
    (item) => item.id === action.commandId,
  );
  const permissionDenied = await requireAllPermissions(
    c,
    request.workspaceId,
    tool?.permissions.length
      ? (tool.permissions as WorkspacePermission[])
      : [
          action.requiredPermission ??
            resolved.requiredPermission ??
            "workspace.settings.write",
        ],
  );
  if (permissionDenied) return permissionDenied;
  if (
    action.commandId === "platform.settings.marketplace.plugin.install" ||
    action.commandId === "platform.settings.marketplace.plugin.update"
  ) {
    const input =
      request.input && typeof request.input === "object"
        ? (request.input as Record<string, unknown>)
        : {};
    const pluginId =
      typeof input.pluginId === "string" && input.pluginId.trim()
        ? input.pluginId.trim()
        : typeof input.id === "string" && input.id.trim()
          ? input.id.trim()
          : "";
    const approvalId =
      typeof input.approvalId === "string" && input.approvalId.trim()
        ? input.approvalId.trim()
        : undefined;
    const provisioningTarget =
      typeof input.provisioningTarget === "string" &&
      input.provisioningTarget.trim()
        ? input.provisioningTarget.trim()
        : undefined;
    if (!pluginId)
      return c.json(
        pluginOperationEnvelope("denied", null, "pluginId is required."),
        400,
      );
    return installMarketplacePluginFromSettings(
      c,
      repo,
      request.workspaceId,
      pluginId,
      undefined,
      approvalId,
      provisioningTarget,
    );
  }
  if (action.commandId.startsWith("platform.settings.")) {
    const platformResult = await platformSettingsRuntimeAction(
      c,
      repo,
      request.workspaceId,
      action,
      request.input,
      {
        authAdminJson: (path, init) => authAdminJson(c, path, init),
        authForwardResponse: (path, init) => authForwardResponse(c, path, init),
        authInternalJson: (path) => authInternalJson(c, path),
      },
    );
    if (platformResult) return platformResult;
    return c.json(
      runtimeUnavailable("Platform settings action is not available."),
      501,
    );
  }
  const deployment = await activeRuntimeOrAudit(
    repo,
    request.workspaceId,
    resolved.pluginId,
    "settings.runtime.action",
    c.get("user")?.id,
  );
  if (!deployment)
    return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, {
    workspaceId: request.workspaceId,
    pluginId: resolved.pluginId,
    runtimeKey: deployment.runtimeKey,
    kind: "action",
    operationId: action.commandId,
    contributionId: request.contributionId,
    input: request.input,
    ...(request.routeParams ? { routeParams: request.routeParams } : {}),
  });
  if (runtimeResult) {
    if (!runtimeResult.response.ok)
      return c.json(
        {
          status: "denied",
          data: null,
          error: "Plugin runtime rejected the operation.",
          approvalId: null,
          auditEventId: null,
        },
        runtimeResult.response.status === 404 ? 404 : 403,
      );
    await repo.audit(
      request.workspaceId,
      "settings.runtime.action.execute",
      {
        pluginId: resolved.pluginId,
        contributionId: request.contributionId,
        actionId: action.id,
        commandId: action.commandId,
        dispatched: "plugin-runtime",
      },
      c.get("user")?.id,
    );
    return c.json({
      status: "ok",
      data: runtimeResult.body,
      error: null,
      approvalId: null,
      auditEventId: null,
    });
  }
  await repo.audit(
    request.workspaceId,
    "settings.runtime.action.unavailable",
    {
      pluginId: resolved.pluginId,
      contributionId: request.contributionId,
      actionId: action.id,
      commandId: action.commandId,
    },
    c.get("user")?.id,
  );
  return c.json(runtimeUnavailable(), 501);
});
app.get("/workspaces/:workspaceId/settings/tabs", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(
    c,
    workspaceId,
    "workspace.settings.read",
  );
  if (denied) return denied;
  return c.json({
    tabs: await new CoreRepository(c.env.CORE_DB).settingsTabs(workspaceId),
  });
});
app.get("/workspaces/:workspaceId/settings/tabs/:tabId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(
    c,
    workspaceId,
    "workspace.settings.read",
  );
  if (denied) return denied;
  const resolved = await new CoreRepository(c.env.CORE_DB).settingsTab(
    workspaceId,
    c.req.param("tabId"),
  );
  return resolved
    ? c.json(resolved)
    : c.json(
        errorResponse(failure("not_found", "Settings tab is not available.")),
        404,
      );
});
app.post("/workspaces/:workspaceId/settings/tabs/order", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(
    c,
    workspaceId,
    "workspace.settings.write",
  );
  if (denied) return denied;
  const body = (await c.req.json().catch(() => null)) as {
    tabIds?: unknown;
  } | null;
  if (
    !Array.isArray(body?.tabIds) ||
    !body.tabIds.every((item) => typeof item === "string")
  )
    return c.json(
      errorResponse(
        failure("validation_failed", "tabIds must be a string array."),
      ),
      400,
    );
  await new CoreRepository(c.env.CORE_DB).reorderSettingsTabs(
    workspaceId,
    body.tabIds,
  );
  return c.json({ saved: true });
});
app.get("/workspaces/:workspaceId/settings/:scope", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.settings.read");
  if (denied) return denied;
  const scope = settingScopeSchema.parse(c.req.param("scope")) as SettingScope;
  return c.json({
    settings: await new CoreRepository(c.env.CORE_DB).listSettings(
      workspaceId,
      scope,
    ),
  });
});
app.put("/settings", async (c) => {
  const request = settingWriteRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  const denied = await requirePermission(
    c,
    request.workspaceId,
    "workspace.settings.write",
  );
  if (denied) return denied;
  await new CoreRepository(c.env.CORE_DB).saveSetting(
    request.workspaceId,
    request.scope,
    request.key,
    request.value,
  );
  return c.json({ saved: true });
});
app.get("/workspaces/:workspaceId/settings/general", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(
    c,
    workspaceId,
    "workspace.settings.read",
  );
  if (denied) return denied;
  return c.json({
    settings: await new CoreRepository(c.env.CORE_DB).generalSettings(
      workspaceId,
    ),
  });
});
app.put("/workspaces/:workspaceId/settings/general", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(
    c,
    workspaceId,
    "workspace.settings.write",
  );
  if (denied) return denied;
  const body = await c.req.json().catch(() => null);
  return c.json({
    settings: await new CoreRepository(c.env.CORE_DB).saveGeneralSettings(
      workspaceId,
      body,
      c.get("user")?.id,
    ),
  });
});
app.get("/workspaces/:workspaceId/interface/contributions", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "interface.read");
  if (denied) return denied;
  return c.json({
    contributions: await new CoreRepository(
      c.env.CORE_DB,
    ).interfaceContributions(workspaceId),
  });
});
app.put(
  "/workspaces/:workspaceId/interface/contributions/:contributionId",
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const denied = await requirePermission(c, workspaceId, "interface.write");
    if (denied) return denied;
    const body = (await c.req.json().catch(() => null)) as {
      enabled?: boolean;
      visibleInNavigation?: boolean;
      label?: string;
      icon?: string;
      section?: "user" | "administration";
      displayOrder?: number;
    } | null;
    await new CoreRepository(c.env.CORE_DB).updatePluginUiContribution(
      workspaceId,
      c.req.param("contributionId"),
      body ?? {},
      c.get("user")?.id,
    );
    return c.body(null, 204);
  },
);
app.post("/workspaces/:workspaceId/interface/pages", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "interface.write");
  if (denied) return denied;
  const body = (await c.req.json().catch(() => null)) as {
    title?: string;
    slug?: string;
    label?: string;
    icon?: string;
    navigationSection?: "user" | "administration";
    enabled?: boolean;
    visibleInNavigation?: boolean;
    displayOrder?: number;
    blocks?: Array<{ type: "heading" | "text"; text: string }>;
  } | null;
  if (!body?.title || !body?.slug)
    return c.json(
      errorResponse(
        failure("validation_failed", "title and slug are required."),
      ),
      400,
    );
  const contributionId = await new CoreRepository(
    c.env.CORE_DB,
  ).createManualPage(workspaceId, {
    title: body.title,
    slug: body.slug,
    ...(body.label ? { label: body.label } : {}),
    ...(body.icon ? { icon: body.icon } : {}),
    ...(body.navigationSection
      ? { navigationSection: body.navigationSection }
      : {}),
    ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    ...(body.visibleInNavigation !== undefined
      ? { visibleInNavigation: body.visibleInNavigation }
      : {}),
    ...(body.displayOrder !== undefined
      ? { displayOrder: body.displayOrder }
      : {}),
    ...(body.blocks ? { blocks: body.blocks } : {}),
  });
  const slug = body.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return c.json({ page: { contributionId, path: `/${slug}` } }, 201);
});
app.get(
  "/workspaces/:workspaceId/interface/pages/:contributionId",
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const denied = await requirePermission(c, workspaceId, "interface.read");
    if (denied) return denied;
    return runtimePage(
      c,
      new CoreRepository(c.env.CORE_DB),
      workspaceId,
      c.req.param("contributionId"),
    );
  },
);
app.delete(
  "/workspaces/:workspaceId/interface/pages/:contributionId",
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const denied = await requirePermission(c, workspaceId, "interface.write");
    if (denied) return denied;
    const deleted = await new CoreRepository(
      c.env.CORE_DB,
    ).deleteInterfaceContribution(workspaceId, c.req.param("contributionId"));
    return deleted
      ? c.body(null, 204)
      : c.json(
          errorResponse(
            failure("not_found", "Interface page is not available."),
          ),
          404,
        );
  },
);
app.put("/layouts", async (c) => {
  const request = layoutWriteRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  const denied = await requirePermission(
    c,
    request.workspaceId,
    "layout.write",
  );
  if (denied) return denied;
  await new CoreRepository(c.env.CORE_DB).saveLayout(
    request.workspaceId,
    request.layout,
  );
  return c.json({ saved: true, layout: request.layout });
});
app.get("/workspaces/:workspaceId/layout", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "layout.read");
  if (denied) return denied;
  return c.json({
    layout:
      (await new CoreRepository(c.env.CORE_DB).getLayout(workspaceId)) ?? null,
  });
});
app.get("/workspaces/:workspaceId/rbac/me", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "workspace.read");
  if (denied) return denied;
  return c.json(
    await new CoreRepository(c.env.CORE_DB, c.env).memberSummary(
      workspaceId,
      c.get("user"),
    ),
  );
});
app.get("/workspaces/:workspaceId/auth/security-bootstrap", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.read");
  if (denied) return denied;
  const [security, rbac] = await Promise.all([
    authInternalJson<{ summary: unknown; sessions: unknown }>(
      c,
      `/internal/auth/security-bootstrap?workspaceId=${encodeURIComponent(workspaceId)}`,
    ),
    new CoreRepository(c.env.CORE_DB, c.env).rbacOverview(
      workspaceId,
      c.get("user"),
    ),
  ]);
  return c.json({
    summary: security.summary,
    sessions: security.sessions,
    rbac,
  });
});
app.put("/workspaces/:workspaceId/auth/policy", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.admin");
  if (denied) return denied;
  const body = (await c.req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const mailDeliveryAvailable = Boolean(
    await new CoreRepository(c.env.CORE_DB).activeMailProvider(workspaceId),
  );
  if (body?.requireEmailVerification === true && !mailDeliveryAvailable)
    return c.json(
      errorResponse(
        failure(
          "dependency_unavailable",
          "Email verification requires an active Core Mail Runtime provider.",
        ),
      ),
      409,
    );
  return c.json(
    await authAdminJson(c, "/admin/auth/policy", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, workspaceId, mailDeliveryAvailable }),
    }),
  );
});
app.post("/workspaces/:workspaceId/auth/methods", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.admin");
  if (denied) return denied;
  const body = await c.req.text();
  return c.json(
    await authAdminJson(c, "/admin/auth/methods", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
});
app.put("/workspaces/:workspaceId/auth/methods/:methodId", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.admin");
  if (denied) return denied;
  const body = await c.req.text();
  return c.json(
    await authAdminJson(
      c,
      `/admin/auth/methods/${encodeURIComponent(c.req.param("methodId"))}`,
      { method: "PUT", headers: { "content-type": "application/json" }, body },
    ),
  );
});
app.post("/workspaces/:workspaceId/auth/ui-contributions", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.admin");
  if (denied) return denied;
  const body = await c.req.text();
  return c.json(
    await authAdminJson(c, "/admin/auth/ui-contributions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
  );
});
app.put("/workspaces/:workspaceId/auth/ui-contributions/:id", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "auth.admin");
  if (denied) return denied;
  const body = await c.req.text();
  return c.json(
    await authAdminJson(
      c,
      `/admin/auth/ui-contributions/${encodeURIComponent(c.req.param("id"))}`,
      { method: "PUT", headers: { "content-type": "application/json" }, body },
    ),
  );
});
app.get("/workspaces/:workspaceId/domains", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "domains.read");
  if (denied) return denied;
  return c.json({
    domains: await new CoreRepository(c.env.CORE_DB).listDomains(workspaceId),
  });
});
app.post("/workspaces/:workspaceId/domains", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "domains.write");
  if (denied) return denied;
  const input = domainInput(await c.req.json().catch(() => null));
  if (!input)
    return c.json(
      errorResponse(
        failure(
          "validation_failed",
          "A valid workspace domain payload is required.",
        ),
      ),
      400,
    );
  await new CoreRepository(c.env.CORE_DB).createDomain(
    workspaceId,
    input,
    c.get("user")?.id,
  );
  return c.json(
    {
      domains: await new CoreRepository(c.env.CORE_DB).listDomains(workspaceId),
    },
    201,
  );
});
app.post("/workspaces/:workspaceId/domains/:domainId/verify", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "domains.verify");
  if (denied) return denied;
  const repo = new CoreRepository(c.env.CORE_DB);
  const domain = (await repo.listDomains(workspaceId)).find(
    (entry) => entry.id === c.req.param("domainId"),
  );
  if (!domain)
    return c.json(
      errorResponse(failure("not_found", "Domain is not available.")),
      404,
    );
  const checked = await verifyDnsDomain(domain);
  if (!checked.ok)
    return c.json(
      errorResponse(failure("validation_failed", checked.error)),
      409,
    );
  await repo.verifyDomain(workspaceId, domain.id, c.get("user")?.id);
  return c.json({ domains: await repo.listDomains(workspaceId) });
});
app.post("/workspaces/:workspaceId/domains/:domainId/activate", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "domains.write");
  if (denied) return denied;
  const domainId = c.req.param("domainId");
  if (!domainId)
    return c.json(
      errorResponse(
        failure("validation_failed", "A domain identifier is required."),
      ),
      400,
    );
  const repo = new CoreRepository(c.env.CORE_DB);
  await repo.activateDomain(workspaceId, domainId, c.get("user")?.id);
  return c.json({ domains: await repo.listDomains(workspaceId) });
});
app.post("/workspaces/:workspaceId/domains/:domainId/disable", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "domains.write");
  if (denied) return denied;
  const domainId = c.req.param("domainId");
  if (!domainId)
    return c.json(
      errorResponse(
        failure("validation_failed", "A domain identifier is required."),
      ),
      400,
    );
  const repo = new CoreRepository(c.env.CORE_DB);
  await repo.disableDomain(workspaceId, domainId, c.get("user")?.id);
  return c.json({ domains: await repo.listDomains(workspaceId) });
});
app.get("/workspaces/:workspaceId/mail/summary", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "mail.read");
  if (denied) return denied;
  return c.json(
    await new CoreRepository(c.env.CORE_DB).mailSummary(workspaceId),
  );
});
app.post("/workspaces/:workspaceId/mail/providers", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const denied = await requirePermission(c, workspaceId, "mail.configure");
  if (denied) return denied;
  const input = mailProviderConfigureSchema.parse(
    await c.req.json().catch(() => null),
  );
  const repo = new CoreRepository(c.env.CORE_DB);
  await repo.saveMailProvider(workspaceId, input, c.get("user")?.id);
  return c.json(await repo.mailSummary(workspaceId), 201);
});
app.post(
  "/workspaces/:workspaceId/mail/providers/:providerId/activate",
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const denied = await requirePermission(c, workspaceId, "mail.configure");
    if (denied) return denied;
    const repo = new CoreRepository(c.env.CORE_DB);
    await repo.activateMailProvider(
      workspaceId,
      c.req.param("providerId"),
      c.get("user")?.id,
    );
    return c.json(await repo.mailSummary(workspaceId));
  },
);
app.post(
  "/workspaces/:workspaceId/mail/providers/:providerId/disable",
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const denied = await requirePermission(c, workspaceId, "mail.configure");
    if (denied) return denied;
    const repo = new CoreRepository(c.env.CORE_DB);
    await repo.disableMailProvider(
      workspaceId,
      c.req.param("providerId"),
      c.get("user")?.id,
    );
    return c.json(await repo.mailSummary(workspaceId));
  },
);
app.post(
  "/workspaces/:workspaceId/mail/providers/:providerId/test",
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const denied = await requirePermission(c, workspaceId, "mail.test");
    if (denied) return denied;
    const body = mailProviderTestRequestSchema.parse(
      await c.req.json().catch(() => null),
    );
    const providerId = c.req.param("providerId");
    if (!providerId)
      return c.json(
        errorResponse(
          failure(
            "validation_failed",
            "A mail provider identifier is required.",
          ),
        ),
        400,
      );
    return c.json(
      await new CoreRepository(c.env.CORE_DB).testMailProvider(
        workspaceId,
        providerId,
        body.to,
        c.get("user")?.id,
      ),
    );
  },
);
app.post("/internal/mail/send", async (c) => {
  if (!c.get("internal"))
    return c.json(
      errorResponse(
        failure(
          "not_authorized",
          "Internal mail delivery requires a service binding.",
        ),
      ),
      403,
    );
  const message = mailMessageRequestSchema.parse(
    await c.req.json().catch(() => null),
  );
  return c.json(
    await new CoreRepository(c.env.CORE_DB).sendMail(
      message.workspaceId,
      message,
    ),
  );
});
app.put(
  "/workspaces/:workspaceId/plugin-ui/contributions/:contributionId",
  async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const denied = await requirePermission(
      c,
      workspaceId,
      "workspace.settings.write",
    );
    if (denied) return denied;
    const body = (await c.req.json().catch(() => null)) as {
      enabled?: boolean;
      visibleInNavigation?: boolean;
      label?: string;
      icon?: string;
      section?: "user" | "administration";
      displayOrder?: number;
    } | null;
    await new CoreRepository(c.env.CORE_DB).updatePluginUiContribution(
      workspaceId,
      c.req.param("contributionId"),
      body ?? {},
      c.get("user")?.id,
    );
    return c.body(null, 204);
  },
);
app.post("/workspaces/:workspaceId/plugins/:pluginId/operations/:operationId", async (c) => {
    const workspaceId = c.req.param("workspaceId");
    const denied = await requirePermission(c, workspaceId, "workspace.read");
    if (denied) return denied;
    const body = (await c.req.json().catch(() => null)) as {
      input?: unknown;
      routeParams?: Record<string, string>;
      queryParams?: Record<string, string | string[]>;
    } | null;
    return dispatchPluginOperation(c, {
      workspaceId,
      pluginId: c.req.param("pluginId"),
      operationId: c.req.param("operationId"),
      input: body?.input,
      ...(body?.routeParams ? { routeParams: body.routeParams } : {}),
      ...(body?.queryParams ? { queryParams: body.queryParams } : {}),
    });
  },
);
app.post("/public/:workspaceId/runtime/data", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const request = runtimeDataRequestSchema.parse({
    ...(await c.req.json().catch(() => null)),
    workspaceId,
  });
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.publicRuntimeContribution(
    request.workspaceId,
    request.contributionId,
  );
  if (!resolved?.policy?.enabled)
    return c.json(
      pluginOperationEnvelope("denied", null, "Publication is not available."),
      404,
    );
  if (
    resolved.policy.authenticationMode !== "anonymous" ||
    resolved.policy.access === "authenticated"
  ) {
    const denied = requireRead(c);
    if (denied) return denied;
  }
  const dataSource = resolved.page.dataSources.find(
    (item) => item.id === request.dataSourceId,
  );
  if (!dataSource)
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Data source is not declared by this contribution.",
      ),
      403,
    );
  if (
    !resolved.policy.allowedOperations.includes(dataSource.id) &&
    !resolved.policy.allowedOperations.includes(request.contributionId)
  )
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Public policy does not allow this data source.",
      ),
      403,
    );
  if (dataSource.kind === "static")
    return c.json({
      status: "ok",
      data: staticDataFor(
        (resolved.page as { data?: Record<string, unknown> }).data ?? {},
        dataSource.id,
        dataSource.resource,
      ),
      error: null,
      approvalId: null,
      auditEventId: null,
    });
  const deployment = await activeRuntimeOrAudit(
    repo,
    request.workspaceId,
    resolved.pluginId,
    "public.runtime.ui.data",
    c.get("user")?.id,
  );
  if (!deployment)
    return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, {
    workspaceId: request.workspaceId,
    pluginId: resolved.pluginId,
    runtimeKey: deployment.runtimeKey,
    kind: "data",
    operationId: dataSource.resource ?? dataSource.id,
    contributionId: request.contributionId,
    ...(request.routeParams ? { routeParams: request.routeParams } : {}),
    ...(request.queryParams ? { queryParams: request.queryParams } : {}),
  });
  if (runtimeResult) {
    if (!runtimeResult.response.ok)
      return c.json(
        {
          status: "denied",
          data: null,
          error: "Plugin runtime rejected the public data request.",
          approvalId: null,
          auditEventId: null,
        },
        runtimeResult.response.status === 404 ? 404 : 403,
      );
    await repo.audit(
      request.workspaceId,
      "public.runtime.ui.data.execute",
      {
        pluginId: resolved.pluginId,
        contributionId: request.contributionId,
        dataSourceId: dataSource.id,
        dispatched: "plugin-runtime",
      },
      c.get("user")?.id,
    );
    return c.json({
      status: "ok",
      data: runtimeResult.body,
      error: null,
      approvalId: null,
      auditEventId: null,
    });
  }
  await repo.audit(
    request.workspaceId,
    "public.runtime.ui.data.unavailable",
    {
      pluginId: resolved.pluginId,
      contributionId: request.contributionId,
      dataSourceId: dataSource.id,
    },
    c.get("user")?.id,
  );
  return c.json(runtimeUnavailable(), 501);
});
app.post("/public/:workspaceId/runtime/actions", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const request = runtimeActionRequestSchema.parse({
    ...(await c.req.json().catch(() => null)),
    workspaceId,
  });
  const repo = new CoreRepository(c.env.CORE_DB);
  const resolved = await repo.publicRuntimeContribution(
    request.workspaceId,
    request.contributionId,
  );
  if (!resolved?.policy?.enabled)
    return c.json(
      pluginOperationEnvelope("denied", null, "Publication is not available."),
      404,
    );
  if (
    resolved.policy.authenticationMode !== "anonymous" ||
    resolved.policy.access === "authenticated"
  ) {
    const denied = requireRead(c);
    if (denied) return denied;
  }
  const action = resolved.page.actions.find(
    (item) => item.id === request.actionId,
  );
  if (!action)
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Action is not declared by this contribution.",
      ),
      403,
    );
  if (
    !resolved.policy.allowedOperations.includes(action.id) &&
    !resolved.policy.allowedOperations.includes(action.commandId)
  )
    return c.json(
      pluginOperationEnvelope(
        "denied",
        null,
        "Public policy does not allow this action.",
      ),
      403,
    );
  const deployment = await activeRuntimeOrAudit(
    repo,
    request.workspaceId,
    resolved.pluginId,
    "public.runtime.ui.action",
    c.get("user")?.id,
  );
  if (!deployment)
    return c.json(runtimeUnavailable("Plugin runtime is not active."), 503);
  const runtimeResult = await pluginRuntimeDispatch(c, {
    workspaceId: request.workspaceId,
    pluginId: resolved.pluginId,
    runtimeKey: deployment.runtimeKey,
    kind: "action",
    operationId: action.commandId,
    contributionId: request.contributionId,
    input: request.input,
    ...(request.routeParams ? { routeParams: request.routeParams } : {}),
  });
  if (runtimeResult) {
    if (!runtimeResult.response.ok)
      return c.json(
        {
          status: "denied",
          data: null,
          error: "Plugin runtime rejected the public operation.",
          approvalId: null,
          auditEventId: null,
        },
        runtimeResult.response.status === 404 ? 404 : 403,
      );
    await repo.audit(
      request.workspaceId,
      "public.runtime.ui.action.execute",
      {
        pluginId: resolved.pluginId,
        contributionId: request.contributionId,
        actionId: action.id,
        commandId: action.commandId,
        dispatched: "plugin-runtime",
      },
      c.get("user")?.id,
    );
    return c.json({
      status: "ok",
      data: runtimeResult.body,
      error: null,
      approvalId: null,
      auditEventId: null,
    });
  }
  await repo.audit(
    request.workspaceId,
    "public.runtime.ui.action.unavailable",
    {
      pluginId: resolved.pluginId,
      contributionId: request.contributionId,
      actionId: action.id,
      commandId: action.commandId,
    },
    c.get("user")?.id,
  );
  return c.json(runtimeUnavailable(), 501);
});
app.get("/public/:workspaceId/*", async (c) => {
  const workspaceId = c.req.param("workspaceId");
  const prefix = `/public/${workspaceId}`;
  const publicPath = new URL(c.req.url).pathname.slice(prefix.length) || "/";
  const delivery = await new CoreRepository(c.env.CORE_DB).publicDelivery(
    workspaceId,
    publicPath,
  );
  if (!delivery)
    return c.json(
      errorResponse(failure("not_found", "Public resource is not available.")),
      404,
    );
  if (
    delivery.publication.access === "authenticated" ||
    delivery.publication.authenticationMode === "customer" ||
    delivery.publication.authenticationMode === "verified"
  ) {
    const denied = requireRead(c);
    if (denied) return denied;
  }
  return c.json({
    publication: delivery.publication,
    plugin: delivery.manifest
      ? {
          id: delivery.manifest.id,
          name: delivery.manifest.name,
          version: delivery.manifest.version,
        }
      : null,
    contribution: delivery.contribution ?? null,
    page: delivery.page,
    routeParams: delivery.routeParams,
  });
});
app.post("/publications", async (c) => {
  const input = publicPublicationRequest(await c.req.json().catch(() => null));
  if (!input)
    return c.json(
      errorResponse(
        failure(
          "validation_failed",
          "A valid publication request is required.",
        ),
      ),
      400,
    );
  const denied = await requirePermission(
    c,
    input.workspaceId,
    "publication.publish",
  );
  if (denied) return denied;
  const publication = await new CoreRepository(
    c.env.CORE_DB,
  ).publishWorkspaceContribution(input);
  if (!publication)
    return c.json(
      errorResponse(
        failure("not_found", "Publication target is not available."),
      ),
      404,
    );
  return c.json({ publication }, 201);
});
export default app;
export type CoreApp = typeof app;
