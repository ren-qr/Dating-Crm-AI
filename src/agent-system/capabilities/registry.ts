import type { z } from "zod";
import type { PermissionCode } from "@/business-support/permissions/permissions";
import type { RequestMode } from "../contracts/capability-request";
import type { CapabilityType, JsonRecord, SideEffect, TrustZone } from "../contracts/common-types";

export type CapabilityDefinition = {
  name: string;
  description: string;
  type: CapabilityType;
  enabled: boolean;
  allowedModes: readonly RequestMode[];
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
  argumentHints: Record<string, string>;
  sideEffect: SideEffect;
  requiredPermission: PermissionCode;
  confirmation: "never" | "required";
  trust: readonly TrustZone[];
  resultFields: Record<TrustZone, string[]>;
};
export type AtomicTool = CapabilityDefinition & { type: "tool" };
export type Workflow = CapabilityDefinition & { type: "workflow" };
export type SpecialistAgent = CapabilityDefinition & { type: "specialist" };
export type RawResult = {
  rows: Array<{ storeId: string; ownerId: string; data: JsonRecord }>;
  meta: JsonRecord;
};

export class CapabilityRegistry {
  private definitions = new Map<string, CapabilityDefinition>();
  constructor(definitions: CapabilityDefinition[]) {
    for (const definition of definitions) {
      if (this.definitions.has(definition.name)) throw new Error("Duplicate capability");
      this.definitions.set(definition.name, definition);
    }
  }
  get(name: string) {
    return this.definitions.get(name);
  }
  list() {
    return [...this.definitions.values()].filter((definition) => definition.enabled);
  }
}
