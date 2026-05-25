import { appErrorSchema, notificationSchema, type AppError, type AppErrorCode, type Notification, type NotificationLevel } from "@v2/rpc-contracts";

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

export function errorResponse(error: unknown, requestId?: string): { error: AppError } {
  if (error instanceof AppFailure) {
    const id = error.payload.requestId ?? requestId;
    return { error: id ? { ...error.payload, requestId: id } : error.payload };
  }
  const payload = { code: "internal_error" as const, message: "An unexpected error occurred.", retryable: false };
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
