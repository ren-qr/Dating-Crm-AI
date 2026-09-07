import { capabilityRequestSchema } from "../contracts/capability-request";
export const validateRequest = (input: unknown) => capabilityRequestSchema.safeParse(input);
