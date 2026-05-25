import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/react";

export const authUrl = import.meta.env.VITE_AUTH_API_URL ?? "http://localhost:8788";

export const authClient = createAuthClient({
  baseURL: authUrl,
  plugins: [passkeyClient()],
});
