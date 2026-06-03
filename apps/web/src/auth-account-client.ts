import { authClient } from "./auth-client";
import { authJson } from "./auth-api";

const isPasskeyCancellationError = (error: unknown) => {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : String(error ?? "");
  return /NotAllowedError|AbortError|The operation either timed out or was not allowed|REGISTRATION_CANCELLED/i.test(
    message,
  );
};

function authErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "object" && error && "message" in error)
    return String((error as { message?: unknown }).message ?? fallback);
  return fallback;
}

export async function addPasskey(name?: string) {
  const result = await authClient.passkey.addPasskey(
    name ? { name } : undefined,
  );
  if (result.error && isPasskeyCancellationError(result.error)) return null;
  if (result.error)
    throw new Error(
      authErrorMessage(result.error, "Passkey registration failed."),
    );
  return result;
}

export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  revokeOtherSessions?: boolean;
}) {
  const result = await authJson<{
    data: unknown;
    error: { message?: string; statusText?: string } | null;
  }>("/change-password", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (result.error)
    throw new Error(
      String(
        result.error.message ??
          result.error.statusText ??
          "Password change failed.",
      ),
    );
  return result.data;
}

export async function updateProfileDetails(input: {
  name: string;
  language?: string | null;
  location?: string | null;
  timezone?: string | null;
}) {
  const result = await authJson<{
    data: unknown;
    error: { message?: string; statusText?: string } | null;
  }>("/api/auth/update-user", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (result.error)
    throw new Error(
      String(
        result.error.message ??
          result.error.statusText ??
          "Profile update failed.",
      ),
    );
  return result.data;
}

export async function revokeProfileSession(
  sessionId: string,
): Promise<{ revoked: boolean; currentSessionRevoked: boolean }> {
  const result = await authJson<{
    data: { revoked: boolean; currentSessionRevoked: boolean };
    error: { message?: string; statusText?: string } | null;
  }>("/api/auth/profile/sessions/revoke", {
    body: JSON.stringify({ sessionId }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (result.error)
    throw new Error(
      String(
        result.error.message ??
          result.error.statusText ??
          "Session revoke failed.",
      ),
    );
  return result.data;
}

export async function revokeOtherProfileSessions(): Promise<{
  revokedCount: number;
}> {
  const result = await authJson<{
    data: { revokedCount: number };
    error: { message?: string; statusText?: string } | null;
  }>("/api/auth/profile/sessions/revoke-others", {
    method: "POST",
  });

  if (result.error)
    throw new Error(
      String(
        result.error.message ??
          result.error.statusText ??
          "Session revoke failed.",
      ),
    );
  return result.data;
}

export async function enableTwoFactor(
  password?: string,
): Promise<{ totpURI: string; backupCodes: string[] }> {
  const result = await authClient.twoFactor.enable(
    password ? { password } : {},
  );
  if (result.error)
    throw new Error(
      authErrorMessage(result.error, "Two-factor enrollment failed."),
    );
  return result.data as { totpURI: string; backupCodes: string[] };
}

export async function disableTwoFactor(
  password?: string,
): Promise<{ status: boolean }> {
  const result = await authClient.twoFactor.disable(
    password ? { password } : {},
  );
  if (result.error)
    throw new Error(
      authErrorMessage(result.error, "Two-factor disable failed."),
    );
  return result.data as { status: boolean };
}

export async function generateTwoFactorBackupCodes(
  password?: string,
): Promise<{ status: boolean; backupCodes: string[] }> {
  const result = await authClient.twoFactor.generateBackupCodes(
    password ? { password } : {},
  );
  if (result.error)
    throw new Error(
      authErrorMessage(result.error, "Backup code generation failed."),
    );
  return result.data as { status: boolean; backupCodes: string[] };
}

export async function verifyTwoFactorCode(
  code: string,
  trustDevice = false,
): Promise<{ token: string; user: unknown }> {
  const result = await authClient.twoFactor.verifyTotp({ code, trustDevice });
  if (result.error)
    throw new Error(
      authErrorMessage(result.error, "Two-factor verification failed."),
    );
  return result.data as { token: string; user: unknown };
}
