import type { CoreSessionUser } from "./access";
import type { CoreRepository } from "./repository";

type PlatformAccountRuntimeContext = {
  get(key: "user"): CoreSessionUser | null;
};

type AuthInternalJson = <T>(path: string) => Promise<T>;

export async function platformAccountRuntimeData(
  c: PlatformAccountRuntimeContext,
  repo: CoreRepository,
  workspaceId: string,
  authInternalJson: AuthInternalJson,
) {
  const [profile, workspaces] = await Promise.all([
    authInternalJson<{
      profile: {
        id: string;
        name: string | null;
        email: string;
        emailVerified: boolean;
        twoFactorEnabled: boolean;
        language: string | null;
        location: string | null;
        timezone: string | null;
        passkeys: Array<{
          id: string;
          name: string | null;
          deviceType: string;
          backedUp: boolean;
          createdAt: number | string;
        }>;
        sessions: number;
        activeSessions: Array<{
          id: string;
          current: boolean;
          ipAddress: string | null;
          userAgent: string | null;
          createdAt: number | string;
          expiresAt: number | string;
          impersonatedBy: string | null;
        }>;
        createdAt: number | string;
        updatedAt: number | string;
        isPlatformAdmin: boolean;
      };
    }>(`/public/auth/profile`),
    repo.accessibleWorkspaces(c.get("user")),
  ]);
  const currentWorkspace =
    workspaces.find((workspace) => workspace.id === workspaceId) ?? null;
  return { profile: profile.profile, workspaces, currentWorkspace };
}
