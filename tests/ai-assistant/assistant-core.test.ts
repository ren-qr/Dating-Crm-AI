import { describe, expect, it, vi } from "vitest";
import { runAssistantCore } from "@/ai-assistant/assistant-core";

describe("Assistant Core", () => {
  it("returns a normal reply without invoking a member query", async () => {
    const complete = vi.fn(async () => JSON.stringify({ type: "reply", content: "你好，有什么需要协助？" }));

    await expect(runAssistantCore([{ role: "user", content: "你好" }], complete)).resolves.toEqual({
      type: "reply",
      content: "你好，有什么需要协助？",
    });
  });

  it("normalizes Query V2 numeric fields returned as strings", async () => {
    const action = await runAssistantCore([{ role: "user", content: "30岁女生" }], async () => JSON.stringify({
      type: "query_members",
      query: {
        task: "search_members",
        filters: [
          { field: "age", op: "eq", value: "30" },
          { field: "gender", op: "eq", value: "FEMALE" },
        ],
        unresolved: [],
      },
    }));

    expect(action).toEqual({
      type: "query_members",
      query: {
        task: "search_members",
        filters: [
          { field: "age", op: "eq", value: 30 },
          { field: "gender", op: "eq", value: "FEMALE" },
        ],
        unresolved: [],
      },
    });
  });

  it("keeps all supported query conditions and unresolved language", async () => {
    const action = await runAssistantCore([{ role: "user", content: "杭州30岁以下条件不错的女生" }], async () => JSON.stringify({
      type: "query_members",
      query: {
        task: "search_members",
        filters: [
          { field: "currentLocation", op: "eq", value: "杭州" },
          { field: "age", op: "lte", value: 30 },
          { field: "gender", op: "eq", value: "FEMALE" },
        ],
        unresolved: [{ text: "条件不错", reason: "没有正式业务标准" }],
      },
    }));

    expect(action).toMatchObject({
      type: "query_members",
      query: {
        filters: [
          { field: "currentLocation", op: "eq", value: "杭州" },
          { field: "age", op: "lte", value: 30 },
          { field: "gender", op: "eq", value: "FEMALE" },
        ],
        unresolved: [{ text: "条件不错", reason: "没有正式业务标准" }],
      },
    });
  });

  it("handles phone lookup locally before any cloud completion", async () => {
    const complete = vi.fn(async () => JSON.stringify({ type: "reply", content: "不应调用" }));

    const action = await runAssistantCore([{ role: "user", content: "查询 138 0013 8000 的会员" }], complete);

    expect(complete).not.toHaveBeenCalled();
    expect(action).toEqual({
      type: "query_members",
      query: {
        task: "find_member",
        filters: [{ field: "phone", op: "eq", value: "13800138000" }],
        unresolved: [],
      },
    });
  });

  it("redacts sensitive history before sending a non-sensitive request to the model", async () => {
    const complete = vi.fn(async () => JSON.stringify({ type: "reply", content: "好的" }));

    await runAssistantCore([
      { role: "user", content: "会员电话是 13800138000" },
      { role: "assistant", content: "已收到" },
      { role: "user", content: "你好" },
    ], complete);

    expect(complete).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([
      expect.objectContaining({ content: expect.not.stringContaining("13800138000") }),
    ]));
  });
});
