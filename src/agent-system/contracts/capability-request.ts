import { z } from "zod";

const value = z.union([
  z.string().max(2000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().max(200)).max(50),
  z.null(),
]);

export const requestModeSchema = z.enum(["new_query", "refine_query", "paginate_query"]);
export const argumentSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("exact"),
      operator: z.enum(["eq", "gte", "lte", "between", "in"]).optional(),
      value,
    })
    .strict(),
  z
    .object({
      kind: z.literal("semantic"),
      concept: z.string().max(100).optional(),
      operator: z.string().max(100).optional(),
      value: value.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("reference"),
      ref: z.enum([
        "current_target",
        "selected_member",
        "selected_refs",
        "active_query",
        "result_item",
      ]),
      value: z.union([z.string().max(100), z.number().int().min(1).max(50)]).optional(),
    })
    .strict(),
]);

export const capabilityRequestSchema = z
  .object({
    capability: z.string().min(1).max(100),
    requestMode: requestModeSchema.default("new_query"),
    args: z.record(argumentSchema).refine((args) => Object.keys(args).length <= 30),
  })
  .strict();

export type CapabilityRequest = z.infer<typeof capabilityRequestSchema>;
export type RequestMode = z.infer<typeof requestModeSchema>;
