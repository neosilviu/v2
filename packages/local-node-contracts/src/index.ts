import { z } from "zod";

export const runnerPairingStateSchema = z.enum(["unpaired", "pairing", "paired", "revoked"]);
export const runnerModuleStatusSchema = z.enum(["online", "offline", "not-configured", "error"]);

export const runnerModuleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  status: runnerModuleStatusSchema,
  detail: z.string().optional(),
});

export const runnerHealthSchema = z.object({
  status: z.enum(["online", "offline", "mock-development-only", "not-configured"]),
  runnerVersion: z.string().nullable().default(null),
  paired: z.boolean().default(false),
  modules: z.array(runnerModuleSchema).default([]),
  checkedAt: z.string().optional(),
});

export const runnerChannelProviderSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["gmail", "whatsapp", "local-files", "print-center", "office", "archive"]),
  title: z.string().min(1),
  status: runnerModuleStatusSchema,
});

export const runnerCommandSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["health", "pair", "disconnect", "module-status", "test-channel"]),
  input: z.record(z.string(), z.unknown()).default({}),
});

export const runnerCommandResultSchema = z.object({
  ok: z.boolean(),
  status: z.enum(["configured", "not-configured", "mock-development-only", "unavailable", "failed"]),
  message: z.string().optional(),
  health: runnerHealthSchema.optional(),
});

export type RunnerHealth = z.output<typeof runnerHealthSchema>;
export type RunnerModule = z.output<typeof runnerModuleSchema>;
export type RunnerPairingState = z.output<typeof runnerPairingStateSchema>;
export type RunnerChannelProvider = z.output<typeof runnerChannelProviderSchema>;
export type RunnerCommand = z.output<typeof runnerCommandSchema>;
export type RunnerCommandResult = z.output<typeof runnerCommandResultSchema>;
