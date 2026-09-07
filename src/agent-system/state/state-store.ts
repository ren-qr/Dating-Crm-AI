import type { RuntimeContext } from "../runtime/runtime-context";
import type { SessionLog } from "./session-log";
import { emptyWorkingState, type WorkingState } from "./working-state";
import type { TaskState } from "./task-state";

export type LoadedState = { log: SessionLog; working: WorkingState; tasks: TaskState[] };
export interface StateStore {
  withState<T>(context: RuntimeContext, run: (state: LoadedState) => Promise<T>): Promise<T>;
}
export class StateAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateAccessError";
  }
}
export class StateBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateBusyError";
  }
}

// Development store: isolated by authenticated subject, serialized per session.
export class MemoryStateStore implements StateStore {
  private entries = new Map<
    string,
    { owner: string; store: string | null; zone: string; state: LoadedState }
  >();
  private busy = new Set<string>();
  async withState<T>(context: RuntimeContext, run: (state: LoadedState) => Promise<T>): Promise<T> {
    const key = context.sessionId;
    let entry = this.entries.get(key);
    if (
      entry &&
      (entry.owner !== context.operatorId ||
        entry.store !== context.storeId ||
        entry.zone !== context.trustZone)
    )
      throw new StateAccessError("会话不可访问，切换模型信任区后请新建会话");
    if (this.busy.has(key)) throw new StateBusyError("该会话正在处理上一条消息");
    if (!entry) {
      if (this.entries.size >= 1000) throw new StateBusyError("开发状态存储已满，请重启服务");
      entry = {
        owner: context.operatorId,
        store: context.storeId,
        zone: context.trustZone,
        state: { log: [], working: emptyWorkingState(), tasks: [] },
      };
      this.entries.set(key, entry);
    }
    this.busy.add(key);
    try {
      return await run(entry.state);
    } finally {
      this.busy.delete(key);
    }
  }
}
