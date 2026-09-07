export type TaskState = {
  id: string;
  workflow: string;
  version: number;
  status: "running" | "waiting_user" | "waiting_approval" | "completed" | "failed" | "cancelled";
  currentStep: string;
  completedSideEffects: string[];
  idempotencyKeys: string[];
  checkpointVersion: number;
};
