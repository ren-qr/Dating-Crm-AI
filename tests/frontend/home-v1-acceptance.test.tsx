import * as React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: authMocks.signIn,
  signOut: authMocks.signOut,
}));

import Home from "@/app/page";
import { signOutToCurrentOrigin } from "@/interface/shared/legacy-client/members";

describe("精简 V1 首页验收", () => {
  beforeEach(() => {
    authMocks.signIn.mockReset();
    authMocks.signOut.mockReset();
    authMocks.signOut.mockResolvedValue({ url: "http://localhost:3000/" });
    window.sessionStorage.clear();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);

        if (url === "/api/v1/me") {
          return Response.json({
            code: 0,
            message: "success",
            data: {
              employeeId: "emp_manager_1",
              email: "manager@meetra.local",
              name: "门店店长",
              storeId: "demo-store-new",
              storeName: "新创朝阳店",
              roleCodes: ["store-manager"],
              permissions: ["member:read", "member:write", "followup:read", "blacklist:read", "audit:read"],
            },
            requestId: "me-request",
            timestamp: "2026-07-11T00:00:00.000Z",
          });
        }

        if (url === "/api/v1/ai/member-query") {
          return Response.json({
            code: 0,
            message: "success",
            data: {
              query: {
                task: "search_members",
                filters: [
                  { field: "currentLocation", op: "eq", value: "杭州" },
                  { field: "age", op: "lte", value: 30 },
                  { field: "gender", op: "eq", value: "FEMALE" },
                ],
                unresolved: [],
              },
            },
            requestId: "ai-query-request",
            timestamp: "2026-09-10T00:00:00.000Z",
          });
        }

        if (url === "/api/v1/ai/assistant") {
          const latestMessage = JSON.parse(String(init?.body)).messages.at(-1)?.content;
          if (latestMessage === "30岁女生") {
            return Response.json({
              code: 0,
              message: "success",
              data: {
                action: {
                  type: "query_members",
                  query: {
                    task: "search_members",
                    filters: [
                      { field: "age", op: "eq", value: 30 },
                      { field: "gender", op: "eq", value: "FEMALE" },
                    ],
                    unresolved: [],
                  },
                },
                content: "找到 1 位符合条件的会员。",
                result: {
                  task: "search_members",
                  items: [{
                    id: "member_1",
                    memberNo: "M001",
                    name: "林若妍",
                    age: 30,
                    gender: "FEMALE",
                    status: "ACTIVE",
                    heightCm: 165,
                    weightKg: null,
                    occupation: "设计师",
                    education: "本科",
                    maritalStatus: "未婚",
                    currentLocation: { province: "浙江省", city: "杭州市", district: "西湖区" },
                    profileCompletenessPercent: 80,
                  }],
                  page: 1,
                  pageSize: 20,
                  total: 1,
                  hasNext: false,
                },
              },
              requestId: "assistant-query-request",
              timestamp: "2026-09-10T00:00:00.000Z",
            });
          }

          return Response.json({
            code: 0,
            message: "success",
            data: {
              action: { type: "reply" },
              content: "你好，我可以协助普通对话或查询会员。",
            },
            requestId: "assistant-request",
            timestamp: "2026-09-10T00:00:00.000Z",
          });
        }

        return Response.json({
          code: 0,
          message: "success",
          data: {
            items: [],
            page: 1,
            pageSize: 20,
            total: 0,
            hasNext: false,
          },
          requestId: "members-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }),
    );
  });

  it("focuses the main navigation on overview, members, followups, blacklist, and audit", async () => {
    globalThis.React = React;

    render(<Home />);

    const nav = screen.getByRole("navigation");
    ["概览", "会员档案", "跟进回访", "黑名单", "审计", "AI 助理"].forEach((name) => {
      expect(within(nav).getByRole("button", { name })).toBeInTheDocument();
    });
    ["活动", "收费", "财务", "人员", "匹配", "导出", "备份"].forEach((name) => {
      expect(within(nav).queryByRole("button", { name })).not.toBeInTheDocument();
    });
    expect(await screen.findByText("今日运营总览")).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "会员档案" }));
    expect(await screen.findByText("暂无匹配会员，调整筛选或新增会员后再试。")).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "跟进回访" }));
    expect(screen.getByText("跟进回访工作台")).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "黑名单" }));
    expect(screen.getByText("黑名单复核")).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "审计" }));
    expect(screen.getByText("审计留痕")).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("button", { name: "AI 助理" }));
    expect(screen.getByRole("heading", { name: "AI 助理", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("门店：新创朝阳店")).toBeInTheDocument();
    expect(screen.getByText("角色：管理员")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "退出登录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "打开 AI 助理" })).toBeInTheDocument();
  });

  it("uses the shared AI assistant chat instead of the Query V2 workbench draft", async () => {
    globalThis.React = React;
    render(<Home />);

    const nav = screen.getByRole("navigation");
    fireEvent.click(await within(nav).findByRole("button", { name: "AI 助理" }));
    const messageInput = screen.getByLabelText("输入消息");
    fireEvent.change(messageInput, { target: { value: "你好" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("你好，我可以协助普通对话或查询会员。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成筛选条件" })).not.toBeInTheDocument();
    expect(screen.queryByText("识别结果")).not.toBeInTheDocument();
  });

  it("opens the same chat interaction from the floating assistant", async () => {
    globalThis.React = React;
    render(<Home />);

    fireEvent.click(await screen.findByRole("button", { name: "打开 AI 助理" }));

    expect(screen.getByRole("dialog", { name: "AI 助理" })).toBeInTheDocument();
    expect(screen.getByLabelText("输入消息")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "生成筛选条件" })).not.toBeInTheDocument();
  });

  it("shows Assistant member results as direct cards", async () => {
    globalThis.React = React;
    render(<Home />);

    const nav = screen.getByRole("navigation");
    fireEvent.click(await within(nav).findByRole("button", { name: "AI 助理" }));
    fireEvent.change(screen.getByLabelText("输入消息"), { target: { value: "30岁女生" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(await screen.findByText("林若妍")).toBeInTheDocument();
    expect(screen.getByText("30岁 · 女 · 设计师 · 本科")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /林若妍/ })).toBeInTheDocument();
  });

  it("shows personnel, store, and system management to managers", async () => {
    globalThis.React = React;

    render(<Home />);

    const nav = screen.getByRole("navigation");
    expect(await within(nav).findByRole("button", { name: "人员管理" })).toHaveAttribute("aria-disabled", "false");
    expect(within(nav).getByRole("button", { name: "门店管理" })).toHaveAttribute("aria-disabled", "false");
    expect(within(nav).getByRole("button", { name: "系统设置" })).toHaveAttribute("aria-disabled", "false");

    fireEvent.click(within(nav).getByRole("button", { name: "人员管理" }));
    expect(await screen.findByRole("heading", { name: "人员管理", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("当前职级：管理员")).toBeInTheDocument();
    expect(screen.getByText("管理范围：所有门店")).toBeInTheDocument();
  });

  it("loads staff accounts and creates a staff account from personnel management", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/v1/me") {
        return Response.json({
          code: 0,
          message: "success",
          data: {
            employeeId: "emp_manager_1",
            email: "manager@meetra.local",
            name: "门店店长",
            storeId: "demo-store-shanghai",
            storeName: "上海人民广场演示店",
            roleCodes: ["store-manager"],
            roleLevel: "manager",
            roleName: "管理员",
            permissions: ["member:read", "member:write", "staff:read", "staff:write", "audit:read"],
          },
          requestId: "me-manager-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      if (url === "/api/v1/staff" && init?.method === "POST") {
        return Response.json({
          code: 0,
          message: "创建成功",
          data: {
            id: "emp_new",
            storeId: "demo-store-shanghai",
            email: "new-staff@meetra.local",
            name: "新员工",
            status: "ACTIVE",
            roleCodes: ["consultant"],
            roleLevel: "staff",
            roleName: "员工",
            createdAt: "2026-07-11T00:00:00.000Z",
            updatedAt: "2026-07-11T00:00:00.000Z",
          },
          requestId: "create-staff-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        }, { status: 201 });
      }

      if (url === "/api/v1/staff") {
        return Response.json({
          code: 0,
          message: "success",
          data: {
            storeId: "demo-store-shanghai",
            items: [{
              id: "emp_staff_1",
              storeId: "demo-store-shanghai",
              email: "staff@meetra.local",
              name: "一线员工",
              status: "ACTIVE",
              roleCodes: ["consultant"],
              roleLevel: "staff",
              roleName: "员工",
              createdAt: "2026-07-11T00:00:00.000Z",
              updatedAt: "2026-07-11T00:00:00.000Z",
            }],
          },
          requestId: "staff-list-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      if (url.includes("/api/v1/stores") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return Response.json({
          code: 0,
          message: "创建成功",
          data: {
            id: body.id,
            name: body.name,
            address: body.address,
            phone: body.phone,
            status: "ACTIVE",
            employeeCount: 0,
            memberCount: 0,
            createdAt: "2026-07-11T00:00:00.000Z",
            updatedAt: "2026-07-11T00:00:00.000Z",
          },
          requestId: "store-create-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        }, { status: 201 });
      }

      if (url.includes("/api/v1/stores/demo-store-shanghai") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return Response.json({
          code: 0,
          message: "更新成功",
          data: {
            id: "demo-store-shanghai",
            name: body.name,
            address: body.address,
            phone: body.phone,
            status: "ACTIVE",
            employeeCount: 3,
            memberCount: 12,
            createdAt: "2026-07-11T00:00:00.000Z",
            updatedAt: "2026-07-11T00:00:00.000Z",
          },
          requestId: "store-update-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      if (url.includes("/api/v1/stores")) {
        return Response.json({
          code: 0,
          message: "success",
          data: {
            items: [{
              id: "demo-store-shanghai",
              name: "上海人民广场演示店",
              address: "上海市黄浦区",
              phone: "021-00000000",
              status: "ACTIVE",
              employeeCount: 3,
              memberCount: 12,
              createdAt: "2026-07-11T00:00:00.000Z",
              updatedAt: "2026-07-11T00:00:00.000Z",
            }, {
              id: "demo-store-hangzhou",
              name: "杭州西湖店",
              address: "杭州市西湖区",
              phone: "0571-00000000",
              status: "ACTIVE",
              employeeCount: 0,
              memberCount: 0,
              createdAt: "2026-07-11T00:00:00.000Z",
              updatedAt: "2026-07-11T00:00:00.000Z",
            }],
          },
          requestId: "stores-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      return Response.json({
        code: 0,
        message: "success",
        data: { items: [], page: 1, pageSize: 20, total: 0, hasNext: false },
        requestId: "fallback-request",
        timestamp: "2026-07-11T00:00:00.000Z",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    globalThis.React = React;

    render(<Home />);

    const nav = screen.getByRole("navigation");
    fireEvent.click(await within(nav).findByRole("button", { name: "人员管理" }));

    expect(await screen.findByDisplayValue("一线员工")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "新增账号" }));
    fireEvent.change(screen.getByLabelText("姓名"), { target: { value: "新员工" } });
    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "new-staff" } });
    fireEvent.change(screen.getByLabelText("初始密码"), { target: { value: "Demo@123456" } });
    fireEvent.click(screen.getByRole("button", { name: "创建账号" }));

    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url) === "/api/v1/staff" && init?.method === "POST")).toBe(true));
    const createCall = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/v1/staff" && init?.method === "POST");
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      email: "new-staff@meetra.local",
      name: "新员工",
      roleLevel: "staff",
      storeId: "demo-store-shanghai",
    });
    expect(await screen.findByDisplayValue("new-staff@meetra.local")).toBeInTheDocument();
  });

  it("shows personnel, store management, and AI system settings to manager accounts", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/v1/me") {
        return Response.json({
          code: 0,
          message: "success",
          data: {
            employeeId: "emp_owner",
            email: "owner@meetra.local",
            name: "老板",
            storeId: "demo-store-shanghai",
            storeName: "上海人民广场演示店",
            roleCodes: ["admin"],
            roleLevel: "manager",
            roleName: "管理员",
            permissions: ["member:read", "member:write", "staff:read", "staff:write", "role:write", "audit:read"],
          },
          requestId: "me-owner-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      if (url === "/api/v1/staff/emp_staff" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return Response.json({
          code: 0,
          message: "更新成功",
          data: {
            id: "emp_staff",
            storeId: body.storeId ?? "demo-store-shanghai",
            email: body.email ?? "staff@meetra.local",
            name: body.name ?? "一线员工",
            status: "ACTIVE",
            roleCodes: body.roleLevel === "manager" ? ["store_manager"] : ["consultant"],
            roleLevel: body.roleLevel ?? "staff",
            roleName: body.roleLevel === "manager" ? "管理员" : "员工",
            createdAt: "2026-07-11T00:00:00.000Z",
            updatedAt: "2026-07-11T00:00:00.000Z",
          },
          requestId: "staff-role-update",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      if (url === "/api/v1/staff") {
        return Response.json({
          code: 0,
          message: "success",
          data: {
            storeId: "demo-store-shanghai",
            items: [{
              id: "emp_staff",
              storeId: "demo-store-shanghai",
              email: "staff@meetra.local",
              name: "一线员工",
              status: "ACTIVE",
              roleCodes: ["consultant"],
              roleLevel: "staff",
              roleName: "员工",
              createdAt: "2026-07-11T00:00:00.000Z",
              updatedAt: "2026-07-11T00:00:00.000Z",
            }],
          },
          requestId: "staff-list-owner-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      if (url === "/api/v1/ai/config") {
        return Response.json({
          code: 0,
          message: "success",
          data: {
            enabled: true,
            provider: "mock",
            model: "mock-ai",
            configured: true,
          },
          requestId: "ai-config-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      if (url.includes("/api/v1/stores") && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return Response.json({
          code: 0,
          message: "创建成功",
          data: {
            id: body.id,
            name: body.name,
            address: body.address,
            phone: body.phone,
            status: "ACTIVE",
            employeeCount: 0,
            memberCount: 0,
            createdAt: "2026-07-11T00:00:00.000Z",
            updatedAt: "2026-07-11T00:00:00.000Z",
          },
          requestId: "store-create-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        }, { status: 201 });
      }

      if (url.includes("/api/v1/stores/demo-store-shanghai") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return Response.json({
          code: 0,
          message: "更新成功",
          data: {
            id: "demo-store-shanghai",
            name: body.name,
            address: body.address,
            phone: body.phone,
            status: "ACTIVE",
            employeeCount: 3,
            memberCount: 12,
            createdAt: "2026-07-11T00:00:00.000Z",
            updatedAt: "2026-07-11T00:00:00.000Z",
          },
          requestId: "store-update-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      if (url.includes("/api/v1/stores")) {
        return Response.json({
          code: 0,
          message: "success",
          data: {
            items: [{
              id: "demo-store-shanghai",
              name: "上海人民广场演示店",
              address: "上海市黄浦区",
              phone: "021-00000000",
              status: "ACTIVE",
              employeeCount: 3,
              memberCount: 12,
              createdAt: "2026-07-11T00:00:00.000Z",
              updatedAt: "2026-07-11T00:00:00.000Z",
            }, {
              id: "demo-store-hangzhou",
              name: "杭州西湖店",
              address: "杭州市西湖区",
              phone: "0571-00000000",
              status: "ACTIVE",
              employeeCount: 0,
              memberCount: 0,
              createdAt: "2026-07-11T00:00:00.000Z",
              updatedAt: "2026-07-11T00:00:00.000Z",
            }],
          },
          requestId: "stores-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      return Response.json({
        code: 0,
        message: "success",
        data: { items: [], page: 1, pageSize: 20, total: 0, hasNext: false },
        requestId: "dashboard-request",
        timestamp: "2026-07-11T00:00:00.000Z",
      });
    });
    vi.stubGlobal(
      "fetch",
      fetchMock,
    );
    globalThis.React = React;

    render(<Home />);

    const nav = screen.getByRole("navigation");
    expect(await within(nav).findByRole("button", { name: "人员管理" })).toHaveAttribute("aria-disabled", "false");
    expect(within(nav).getByRole("button", { name: "门店管理" })).toHaveAttribute("aria-disabled", "false");
    expect(within(nav).getByRole("button", { name: "系统设置" })).toHaveAttribute("aria-disabled", "false");

    fireEvent.click(within(nav).getByRole("button", { name: "人员管理" }));
    const roleSelect = await screen.findByLabelText("一线员工 职级");
    fireEvent.change(roleSelect, { target: { value: "manager" } });

    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url) === "/api/v1/staff/emp_staff" && init?.method === "PATCH")).toBe(true));
    const patchCall = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/v1/staff/emp_staff" && init?.method === "PATCH");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({ roleLevel: "manager" });

    await vi.waitFor(() => expect(screen.getByRole("button", { name: "保存" })).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("一线员工 姓名"), { target: { value: "运营主管" } });
    fireEvent.change(screen.getByLabelText("一线员工 邮箱"), { target: { value: "lead@meetra.local" } });
    fireEvent.change(screen.getByLabelText("一线员工 对应门店"), { target: { value: "demo-store-hangzhou" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/v1/staff/emp_staff" && init?.method === "PATCH")).toHaveLength(2);
    });
    const saveCall = fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/v1/staff/emp_staff" && init?.method === "PATCH")[1];
    expect(JSON.parse(String(saveCall?.[1]?.body))).toMatchObject({
      name: "运营主管",
      email: "lead@meetra.local",
      storeId: "demo-store-hangzhou",
    });

    fireEvent.click(within(nav).getByRole("button", { name: "系统设置" }));
    expect(await screen.findByText("AI 管理：直接配置本地模型或云端模型，保存后立即生效。")).toBeInTheDocument();
    expect(screen.getByText("本地模型配置")).toBeInTheDocument();
    expect(screen.getByText("云端模型配置")).toBeInTheDocument();
    expect(screen.getByLabelText(/API Key/)).toBeInTheDocument();

    fireEvent.click(within(nav).getByRole("button", { name: "门店管理" }));
    expect(await screen.findByText("管理门店基础资料、启停状态与人员会员容量。")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("上海人民广场演示店")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("门店编号"), { target: { value: "demo-store-suzhou" } });
    fireEvent.change(screen.getByLabelText("门店名称"), { target: { value: "苏州中心店" } });
    fireEvent.change(screen.getByLabelText("门店地址"), { target: { value: "苏州市工业园区" } });
    fireEvent.change(screen.getByLabelText("门店电话"), { target: { value: "0512-00000000" } });
    fireEvent.click(screen.getByRole("button", { name: "创建" }));

    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/api/v1/stores") && init?.method === "POST")).toBe(true));
    const createStoreCall = fetchMock.mock.calls.find(([url, init]) => String(url).includes("/api/v1/stores") && init?.method === "POST");
    expect(JSON.parse(String(createStoreCall?.[1]?.body))).toMatchObject({ id: "demo-store-suzhou", name: "苏州中心店" });

    const shanghaiNameInput = screen.getByLabelText("demo-store-shanghai 名称");
    fireEvent.change(shanghaiNameInput, { target: { value: "上海人民广场旗舰店" } });
    fireEvent.click(within(shanghaiNameInput.closest("tr")!).getByRole("button", { name: "保存" }));

    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url).includes("/api/v1/stores/demo-store-shanghai") && init?.method === "PATCH")).toBe(true));
    const updateStoreCall = fetchMock.mock.calls.find(([url, init]) => String(url).includes("/api/v1/stores/demo-store-shanghai") && init?.method === "PATCH");
    expect(JSON.parse(String(updateStoreCall?.[1]?.body))).toMatchObject({ name: "上海人民广场旗舰店" });
  });

  it("hides personnel management and system settings from staff accounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url === "/api/v1/me") {
          return Response.json({
            code: 0,
            message: "success",
            data: {
              employeeId: "emp_staff",
              email: "staff@meetra.local",
              name: "员工",
              storeId: "demo-store-shanghai",
              storeName: "上海人民广场演示店",
              roleCodes: ["staff"],
              roleLevel: "staff",
              roleName: "员工",
              permissions: ["member:read", "member:write", "followup:write"],
            },
            requestId: "me-staff-request",
            timestamp: "2026-07-11T00:00:00.000Z",
          });
        }

        return Response.json({
          code: 0,
          message: "success",
          data: { items: [], page: 1, pageSize: 20, total: 0, hasNext: false },
          requestId: "dashboard-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }),
    );
    globalThis.React = React;

    render(<Home />);

    const nav = screen.getByRole("navigation");
    expect(await screen.findByText("角色：员工")).toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "人员管理" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "门店管理" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "系统设置" })).not.toBeInTheDocument();
  });

  it("shows a friendly database setup hint when the shell API fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            code: 2000,
            message: "Prisma database connection failed",
            data: null,
            requestId: "shell-db-down",
            timestamp: "2026-07-11T00:00:00.000Z",
          },
          { status: 500 },
        ),
      ),
    );
    globalThis.React = React;

    render(<Home />);

    expect(await screen.findByText("未登录状态")).toBeInTheDocument();
    expect(screen.getAllByText(/Prisma database connection failed/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/如当前环境没有真实数据库，请配置数据库并运行 pnpm seed 后重试/).length).toBeGreaterThan(0);
  });

  it("signs out without following NEXTAUTH_URL to a stale port", async () => {
    const navigate = vi.fn();

    await signOutToCurrentOrigin(authMocks.signOut, navigate);

    expect(authMocks.signOut).toHaveBeenCalledWith({ redirect: false, callbackUrl: "/" });
    expect(navigate).toHaveBeenCalledWith("/");
  });
});
