import { z } from "zod";

export type PluginValueContract =
  | { type: "unknown" }
  | { type: "string"; minLength?: number; maxLength?: number }
  | { type: "number"; integer?: boolean }
  | { type: "boolean" }
  | { type: "array"; items: PluginValueContract }
  | { type: "object"; properties: Record<string, PluginValueContract>; required?: string[]; additionalProperties?: boolean };

export const pluginValueContractSchema: z.ZodType<PluginValueContract> = z.lazy(() => z.discriminatedUnion("type", [
  z.object({ type: z.literal("unknown") }),
  z.object({ type: z.literal("string"), minLength: z.number().int().nonnegative().optional(), maxLength: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("number"), integer: z.boolean().optional() }),
  z.object({ type: z.literal("boolean") }),
  z.object({ type: z.literal("array"), items: pluginValueContractSchema }),
  z.object({ type: z.literal("object"), properties: z.record(z.string(), pluginValueContractSchema).default({}), required: z.array(z.string()).default([]), additionalProperties: z.boolean().default(false) }),
]));

export const pluginOperationSchema = z.object({
  id: z.string().min(1).regex(/^[a-zA-Z][a-zA-Z0-9._-]*$/),
  title: z.string().min(1),
  description: z.string().optional(),
  permission: z.string().min(1),
  risk: z.enum(["safe", "reversible", "sensitive", "dangerous"]).default("safe"),
  input: pluginValueContractSchema.default({ type: "object", properties: {}, required: [], additionalProperties: false }),
  output: pluginValueContractSchema.default({ type: "unknown" }),
});
export const pluginApiContractSchema = z.object({ version: z.literal(1).default(1), operations: z.array(pluginOperationSchema).default([]) });
export const pluginOperationRequestSchema = z.object({ input: z.unknown().optional(), approvalId: z.string().min(1).optional() });

export function validatePluginValue(contract: PluginValueContract, value: unknown, path = "value"): string | undefined {
  if (contract.type === "unknown") return undefined;
  if (contract.type === "string") return typeof value !== "string" ? `${path} must be a string.` : contract.minLength !== undefined && value.length < contract.minLength ? `${path} is too short.` : contract.maxLength !== undefined && value.length > contract.maxLength ? `${path} is too long.` : undefined;
  if (contract.type === "number") return typeof value !== "number" || !Number.isFinite(value) || (contract.integer === true && !Number.isInteger(value)) ? `${path} must be a valid number.` : undefined;
  if (contract.type === "boolean") return typeof value !== "boolean" ? `${path} must be a boolean.` : undefined;
  if (contract.type === "array") {
    if (!Array.isArray(value)) return `${path} must be an array.`;
    for (let index = 0; index < value.length; index += 1) { const error = validatePluginValue(contract.items, value[index], `${path}[${index}]`); if (error) return error; }
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return `${path} must be an object.`;
  const object = value as Record<string, unknown>;
  for (const key of contract.required ?? []) if (!(key in object)) return `${path}.${key} is required.`;
  if (!contract.additionalProperties) for (const key of Object.keys(object)) if (!(key in contract.properties)) return `${path}.${key} is not declared.`;
  for (const [key, child] of Object.entries(contract.properties)) if (key in object) { const error = validatePluginValue(child, object[key], `${path}.${key}`); if (error) return error; }
  return undefined;
}

export type PluginOperation = z.output<typeof pluginOperationSchema>;
export type PluginApiContract = z.output<typeof pluginApiContractSchema>;
