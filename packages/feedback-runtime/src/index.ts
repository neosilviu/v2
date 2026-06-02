import {
  appErrorSchema,
  notificationSchema,
  type AppError,
  type AppErrorCode,
  type Notification,
  type NotificationLevel,
} from "@v2/rpc-contracts";

export class AppFailure extends Error {
  readonly payload: AppError;

  constructor(payload: AppError) {
    super(payload.message);
    this.name = "AppFailure";
    this.payload = appErrorSchema.parse(payload);
  }
}

export function failure(
  code: AppErrorCode,
  message: string,
  options: Partial<Omit<AppError, "code" | "message">> = {},
) {
  return new AppFailure({ code, message, retryable: false, ...options });
}

export function errorResponse(
  error: unknown,
  requestId?: string,
): { error: AppError } {
  if (error instanceof AppFailure) {
    const id = error.payload.requestId ?? requestId;
    return { error: id ? { ...error.payload, requestId: id } : error.payload };
  }
  const payload = {
    code: "internal_error" as const,
    message: "An unexpected error occurred.",
    retryable: false,
  };
  return { error: requestId ? { ...payload, requestId } : payload };
}

export function notification(
  level: NotificationLevel,
  title: string,
  message?: string,
  source = "platform",
): Notification {
  const payload = {
    id: crypto.randomUUID(),
    level,
    title,
    source,
    dismissible: true,
    createdAt: new Date().toISOString(),
  };
  return notificationSchema.parse(message ? { ...payload, message } : payload);
}

export class NotificationQueue {
  private values: Notification[] = [];

  list() {
    return [...this.values];
  }

  push(value: Notification) {
    this.values = [...this.values, notificationSchema.parse(value)];
    return this.list();
  }

  dismiss(id: string) {
    this.values = this.values.filter((value) => value.id !== id);
    return this.list();
  }

  clear() {
    this.values = [];
    return this.list();
  }
}

export function csv(input?: string): string[] {
  return (input ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function allowedOrigins(
  appOrigin?: string,
  trustedOrigins?: string,
): string[] {
  return [...new Set([...csv(appOrigin), ...csv(trustedOrigins)])];
}

export function isInternalRequest(
  urlStr: string,
  internalHostname: string,
  hasOrigin: boolean,
): boolean {
  try {
    const url = new URL(urlStr);
    return url.hostname === internalHostname && !hasOrigin;
  } catch {
    return false;
  }
}

export async function readSession<T>(
  authFetcher: any,
  headers: Headers,
): Promise<T | null> {
  if (!authFetcher) return null;
  try {
    const response = await authFetcher.fetch(
      "https://auth.internal/api/auth/get-session",
      { headers },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { user?: T | null } | null;
    const user = data?.user;
    return (user as any)?.id && (user as any)?.email ? (user as T) : null;
  } catch {
    return null;
  }
}
