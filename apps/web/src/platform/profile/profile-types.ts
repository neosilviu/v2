import type {
  ActionDefinition,
  DeclarativePageContribution,
} from "@v2/ui-schema";

export type TemplateCallbacks = {
  onAction?: (action: ActionDefinition) => void | Promise<void>;
  onSubmit?: (
    page: DeclarativePageContribution,
    values: Record<string, FormDataEntryValue>,
  ) => void | Promise<void>;
};

export type ProfilePageProps = {
  page: DeclarativePageContribution;
  data?: unknown;
  callbacks?: TemplateCallbacks | undefined;
};

export type ProfilePasskey = {
  id: string;
  name: string | null;
  deviceType: string;
  backedUp: boolean;
  createdAt: number | string;
};

export type ProfileSession = {
  id: string;
  current: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: number | string;
  expiresAt: number | string;
  impersonatedBy: string | null;
};

export type ProfileWorkspace = {
  id: string;
  name: string;
  status: string;
  roles?: Array<{ name: string }>;
};

export type ProfileData = {
  name?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  language?: string | null;
  location?: string | null;
  timezone?: string | null;
  passkeys?: ProfilePasskey[];
  sessions?: number;
  activeSessions?: ProfileSession[];
  isPlatformAdmin?: boolean;
};

export type AccountProfileRuntimeData = {
  profile?: ProfileData;
  workspaces?: ProfileWorkspace[];
  currentWorkspace?: ProfileWorkspace | null;
};
