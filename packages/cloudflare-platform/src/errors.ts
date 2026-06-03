export class CloudflarePlatformError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly code = "cloudflare_platform_error",
    readonly retryable = false,
  ) {
    super(message);
  }
}

export function sanitizeCloudflareError(error: unknown) {
  if (error instanceof CloudflarePlatformError)
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  return {
    code: "cloudflare_platform_error",
    message: "Cloudflare platform operation failed.",
    retryable: true,
  };
}
