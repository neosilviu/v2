import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";

export const authUrl = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:8788";
export const authRedirectStorageKey = "v2.auth.redirectTo";
export const authTwoFactorPendingStorageKey = "v2.auth.twoFactorPending";

export const authClient = createAuthClient({
  baseURL: authUrl,
  plugins: [
    passkeyClient(),
    twoFactorClient({
      onTwoFactorRedirect: () => {
        if (typeof window === "undefined") return;
        window.sessionStorage.setItem(authTwoFactorPendingStorageKey, "1");
        const redirectTo = window.sessionStorage.getItem(authRedirectStorageKey) ?? "/";
        window.location.assign(`/login/two-factor?redirectTo=${encodeURIComponent(redirectTo)}`);
      },
    }),
  ],
});
