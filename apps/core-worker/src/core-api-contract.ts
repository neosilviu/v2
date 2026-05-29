import type { Hono } from "hono";
import type { CoreEnv } from "./env";

type CoreApiEnv = { Bindings: CoreEnv; Variables: { user: { id: string; email: string; name?: string | null; impersonatedBy?: string | null } | null; internal: boolean } };

type EndpointAny<I = {}> = { input: I; output: any; outputFormat: any; status: any };
type RouteEndpoints<Methods extends string, I = {}> = { [Method in Methods as `$${Lowercase<Method>}`]: EndpointAny<I> };

type JsonPost<TParam extends Record<string, string>, TJson> = { $post: (args: { param: TParam; json: TJson }) => Promise<Response> };
type JsonPostQuery<TParam extends Record<string, string>, TJson, TQuery extends Record<string, string | string[]>> = { $post: (args: { param: TParam; json: TJson; query: TQuery }) => Promise<Response> };
type JsonPostNoParam<TJson> = { $post: (args: { json: TJson }) => Promise<Response> };
type JsonGet<TParam extends Record<string, string>> = { $get: (args: { param: TParam }) => Promise<Response> };
type JsonPut<TParam extends Record<string, string>, TJson> = { $put: (args: { param: TParam; json: TJson }) => Promise<Response> };
type JsonDelete<TParam extends Record<string, string>> = { $delete: (args: { param: TParam }) => Promise<Response> };

export type CoreApiSchema = {
  "/health": RouteEndpoints<"get">;
  "/bootstrap": RouteEndpoints<"get", { query?: { workspaceId?: string } }>;
  "/session": RouteEndpoints<"get">;
  "/session/impersonation": RouteEndpoints<"get">;
  "/session/impersonation/stop": RouteEndpoints<"post">;
  "/setup/owner": RouteEndpoints<"get">;
  "/setup/owner/consume": RouteEndpoints<"post">;
  "/internal/setup/owner/consume": RouteEndpoints<"post">;
  "/internal/provision/workspace": RouteEndpoints<"post">;
  "/internal/workspaces/:workspaceId/auth/trust-config": RouteEndpoints<"get">;
  "/runtime/plugins": RouteEndpoints<"get">;
  "/runtime/tools": RouteEndpoints<"get">;
  "/runtime/providers": RouteEndpoints<"get">;
  "/runtime/ui/bootstrap": RouteEndpoints<"get">;
  "/runtime/ui/surfaces": RouteEndpoints<"get">;
  "/runtime/ui/surfaces/:surfaceId": RouteEndpoints<"get">;
  "/runtime/ui/data": RouteEndpoints<"post">;
  "/runtime/ui/actions": RouteEndpoints<"post">;
  "/plugins/installed": RouteEndpoints<"get">;
  "/plugins/upload": RouteEndpoints<"post">;
  "/plugins/install": RouteEndpoints<"post">;
  "/plugins/activate": RouteEndpoints<"post">;
  "/plugins/deactivate": RouteEndpoints<"post">;
  "/plugins/grants": RouteEndpoints<"post">;
  "/marketplace/plugins": RouteEndpoints<"get">;
  "/marketplace/plugins/:pluginId/install": RouteEndpoints<"post">;
  "/publications": RouteEndpoints<"post">;
  "/tools/execute": RouteEndpoints<"post">;
  "/tool-approvals/decision": RouteEndpoints<"post">;
  "/approval-requests/:approvalId/decision": RouteEndpoints<"post">;
  "/layouts": RouteEndpoints<"put">;
  "/workspaces/current/bootstrap": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/bootstrap": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/plugins": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/plugins/:pluginId/operations/:operationId": RouteEndpoints<"post">;
  "/workspaces/:workspaceId/ui/surfaces": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/runtime/registry": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/settings/runtime/data": RouteEndpoints<"post">;
  "/workspaces/:workspaceId/settings/runtime/actions": RouteEndpoints<"post">;
  "/workspaces/:workspaceId/settings/tabs": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/settings/tabs/:tabId": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/settings/tabs/order": RouteEndpoints<"post">;
  "/workspaces/:workspaceId/settings/:scope": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/layout": RouteEndpoints<"get" | "put">;
  "/workspaces/:workspaceId/rbac/me": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/rbac/roles/:roleId/permissions": RouteEndpoints<"post">;
  "/workspaces/:workspaceId/interface/contributions": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/interface/contributions/:contributionId": RouteEndpoints<"put">;
  "/workspaces/:workspaceId/interface/pages": RouteEndpoints<"post">;
  "/workspaces/:workspaceId/interface/pages/:contributionId": RouteEndpoints<"get" | "delete">;
  "/workspaces/:workspaceId/tool-approvals": RouteEndpoints<"get">;
  "/workspaces/:workspaceId/approval-requests": RouteEndpoints<"get">;
  "/public/:workspaceId/runtime/data": RouteEndpoints<"post">;
  "/public/:workspaceId/runtime/actions": RouteEndpoints<"post">;
  "/public/:workspaceId/*": RouteEndpoints<"get">;
};

export type CoreApiCompatibility = {
  workspaces: {
    ":workspaceId": {
      plugins: {
        ":pluginId": {
          operations: {
            ":operationId": JsonPost<{ workspaceId: string; pluginId: string; operationId: string }, { input?: unknown; routeParams?: Record<string, string>; queryParams?: Record<string, string | string[]> }>;
          };
        };
      };
      interface: {
        contributions: {
          ":contributionId": JsonPut<{ workspaceId: string; contributionId: string }, Record<string, unknown>>;
        };
        pages: JsonPost<{ workspaceId: string }, Record<string, unknown>> & {
          ":contributionId": JsonGet<{ workspaceId: string; contributionId: string }> & JsonDelete<{ workspaceId: string; contributionId: string }>;
        };
        settings: {
          runtime: {
            data: JsonPost<{ workspaceId: string }, { workspaceId: string; contributionId: string; dataSourceId: string; routeParams: Record<string, string>; queryParams: Record<string, string | string[]> }>;
            actions: JsonPost<{ workspaceId: string }, { workspaceId: string; contributionId: string; actionId: string; input?: unknown; routeParams: Record<string, string> }>;
          };
        };
      };
      "tool-approvals": JsonGet<{ workspaceId: string }>;
      "approval-requests": JsonGet<{ workspaceId: string }>;
    };
  };
  public: {
    ":workspaceId": {
      runtime: {
        data: JsonPost<{ workspaceId: string }, { workspaceId: string; contributionId: string; dataSourceId: string; routeParams: Record<string, string>; queryParams: Record<string, string[]> }>;
        actions: JsonPost<{ workspaceId: string }, { workspaceId: string; contributionId: string; actionId: string; input?: unknown; routeParams: Record<string, string> }>;
      };
    };
  };
  marketplace: {
    plugins: {
      ":pluginId": {
        install: JsonPostQuery<{ pluginId: string }, { approvalId?: string }, { workspaceId: string }>;
      };
    };
  };
  "tool-approvals": {
    decision: JsonPostNoParam<{ workspaceId: string; approvalId: string; decision: "approved" | "denied" }>;
  };
  "approval-requests": {
    ":approvalId": {
      decision: JsonPost<{ approvalId: string }, { workspaceId: string; decision: "approved" | "denied" }>;
    };
  };
};

export type CoreApi = Hono<CoreApiEnv, CoreApiSchema>;
export type CoreApiClient = Hono<CoreApiEnv, CoreApiSchema>;
