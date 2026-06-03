import { CloudflarePlatformError } from "./errors";

export type CloudflareClientConfig = {
  accountId: string;
  apiToken: string;
  baseUrl?: string;
};
export type CloudflareEnvelope<T> = {
  success: boolean;
  result?: T;
  errors?: Array<{ code: number | string; message: string }>;
};

export class CloudflarePlatformClient {
  readonly baseUrl: string;
  constructor(readonly config: CloudflareClientConfig) {
    this.baseUrl = config.baseUrl ?? "https://api.cloudflare.com/client/v4";
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.config.apiToken}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    const body = (await response
      .json()
      .catch(() => null)) as CloudflareEnvelope<T> | null;
    if (!response.ok || !body?.success) {
      const message =
        body?.errors?.[0]?.message ??
        `Cloudflare API request failed with HTTP ${response.status}.`;
      throw new CloudflarePlatformError(
        message,
        response.status,
        "cloudflare_api_error",
        response.status >= 500 || response.status === 429,
      );
    }
    return body.result as T;
  }

  accountPath(path: string) {
    return `/accounts/${encodeURIComponent(this.config.accountId)}${path}`;
  }
}
