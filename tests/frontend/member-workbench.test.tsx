import * as React from "react";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MemberWorkbenchComponent = React.ComponentType<{
  employee?: {
    employeeId: string;
    email?: string | null;
    name?: string | null;
    storeId?: string | null;
    storeName?: string | null;
    roleCodes: string[];
    permissions: string[];
  } | null;
}>;
const workbenchPath = "src/interface/web/components/member-workbench.tsx";

async function loadWorkbench() {
  expect(
    existsSync(path.join(process.cwd(), workbenchPath)),
    `${workbenchPath} is required by src/app/page.tsx and frontend acceptance tests`,
  ).toBe(true);

  const modulePath = "@/interface/web/components/member-workbench";

  return (await import(modulePath)) as {
    MemberWorkbench: MemberWorkbenchComponent;
  };
}

describe("会员运营工作台 MVP", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/v1/members/owners") {
          return Response.json({
            code: 0,
            message: "success",
            data: {
              storeId: "store_jingan",
              items: [
                { id: "emp_consultant_1", name: "陈敏", roleName: "P1", roleCodes: ["consultant"] },
                { id: "emp_consultant_2", name: "王琳", roleName: "P1", roleCodes: ["consultant"] },
              ],
            },
            requestId: "owners-request",
            timestamp: "2026-07-11T00:00:00.000Z",
          });
        }

        if (url === "/api/v1/stores") {
          return Response.json({
            code: 0,
            message: "success",
            data: {
              items: [
                { id: "store_jingan", name: "静安旗舰店", address: "上海市静安区", phone: "021-00000000", status: "ACTIVE", employeeCount: 2, memberCount: 1, createdAt: "2026-07-11T00:00:00.000Z", updatedAt: "2026-07-11T00:00:00.000Z" },
              ],
            },
            requestId: "stores-request",
            timestamp: "2026-07-11T00:00:00.000Z",
          });
        }

        return Response.json({
          code: 0,
          message: "success",
          data: {
            items: [
              {
                id: "member-1",
                memberNo: "MSTORE1001",
                name: "林晓雨",
                phoneMasked: "138****6210",
                emailMasked: "li***@example.com",
                gender: "FEMALE",
                status: "ACTIVE",
                storeId: "store_jingan",
                ownerEmployeeId: "emp_consultant_1",
                ownerName: "陈敏",
                source: "walk-in",
                profileCompletenessPercent: 72,
                createdAt: "2026-07-11T01:00:00.000Z",
                updatedAt: "2026-07-11T02:00:00.000Z",
              },
            ],
            page: 1,
            pageSize: 10,
            total: 1,
            hasNext: false,
          },
          requestId: "test-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }),
    );
  });

  it("keeps the workbench component available for dashboard integration", () => {
    expect(
      existsSync(path.join(process.cwd(), workbenchPath)),
      `${workbenchPath} is required by src/app/page.tsx and frontend acceptance tests`,
    ).toBe(true);
  });

  it("renders dashboard metrics and the dense member workbench table", async () => {
    globalThis.React = React;
    const { MemberWorkbench } = await loadWorkbench();

    render(<MemberWorkbench />);

    expect(screen.getByRole("heading", { name: "会员运营工作台" })).toBeInTheDocument();
    expect(screen.getByText("词条显示")).toBeInTheDocument();

    const table = screen.getByRole("table");
    ["会员", "手机号", "门店", "顾问", "状态", "画像", "更新时间", "详情"].forEach((head) => {
      expect(within(table).getByRole("columnheader", { name: new RegExp(head) })).toBeInTheDocument();
    });
    expect(within(table).getAllByPlaceholderText("筛选").length).toBeGreaterThan(0);
    expect(await within(table).findByText("林晓雨")).toBeInTheDocument();
    expect(within(table).queryByText("MSTORE1001")).not.toBeInTheDocument();
    expect(within(table).getByText("138****6210")).toBeInTheDocument();
    expect(within(table).queryByText("13812346210")).not.toBeInTheDocument();
    expect(within(table).getAllByText("静安旗舰店").length).toBeGreaterThan(0);
    expect(within(table).getAllByText(/陈敏/).length).toBeGreaterThan(0);
    expect(within(table).getByRole("button", { name: "查看详情" })).toHaveClass("text-zinc-700");
  });

  it("keeps table cells aligned with headers after repeatedly hiding and showing columns", async () => {
    globalThis.React = React;
    const { MemberWorkbench } = await loadWorkbench();

    render(<MemberWorkbench />);
    expect(await screen.findByText("林晓雨")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("手机号"));
    fireEvent.click(screen.getByLabelText("会员编号"));
    fireEvent.click(screen.getByLabelText("手机号"));

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    const headers = within(rows[0]).getAllByRole("columnheader").map((cell) => cell.textContent ?? "");
    const cells = within(rows[1]).getAllByRole("cell").map((cell) => cell.textContent ?? "");

    expect(headers[0]).toContain("会员");
    expect(cells[0]).toContain("林晓雨");
    expect(headers[1]).toContain("手机号");
    expect(cells[1]).toContain("138****6210");
    expect(headers[2]).toContain("会员编号");
    expect(cells[2]).toContain("MSTORE1001");
  });

  it("supports selecting all member table columns without breaking alignment", async () => {
    globalThis.React = React;
    const { MemberWorkbench } = await loadWorkbench();

    render(<MemberWorkbench />);
    expect(await screen.findByText("林晓雨")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("全选"));

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    const headers = within(rows[0]).getAllByRole("columnheader").map((cell) => cell.textContent ?? "");
    const cells = within(rows[1]).getAllByRole("cell").map((cell) => cell.textContent ?? "");

    expect(headers[2]).toContain("会员编号");
    expect(cells[2]).toContain("MSTORE1001");
    expect(headers[6]).toContain("性别");
    expect(cells[6]).toContain("女");
    expect(headers[8]).toContain("学历");
  });

  it("keeps name, phone, and member number filters independent", async () => {
    globalThis.React = React;
    const { MemberWorkbench } = await loadWorkbench();

    render(<MemberWorkbench />);
    expect(await screen.findByText("林晓雨")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("全选"));

    const table = screen.getByRole("table");
    const filterInputs = within(table).getAllByPlaceholderText("筛选") as HTMLInputElement[];

    fireEvent.change(filterInputs[0], { target: { value: "林" } });

    expect(filterInputs[0]).toHaveValue("林");
    expect(filterInputs[1]).toHaveValue("");
    expect(filterInputs[2]).toHaveValue("");
  });

  it("shows readable store names and opens cross-store member details for managers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/v1/members/owners") {
          return Response.json({
            code: 0,
            message: "success",
            data: { storeId: "store_shanghai", items: [{ id: "emp_consultant_1", name: "陈敏", roleName: "P1", roleCodes: ["consultant"] }] },
            requestId: "owners-request",
            timestamp: "2026-07-11T00:00:00.000Z",
          });
        }

        if (url === "/api/v1/stores") {
          return Response.json({
            code: 0,
            message: "success",
            data: {
              items: [
                { id: "store_shanghai", name: "上海人民广场店", address: "上海市黄浦区", phone: "021-00000000", status: "ACTIVE", employeeCount: 3, memberCount: 12, createdAt: "2026-07-11T00:00:00.000Z", updatedAt: "2026-07-11T00:00:00.000Z" },
                { id: "store_hangzhou", name: "杭州西湖店", address: "杭州市西湖区", phone: "0571-00000000", status: "ACTIVE", employeeCount: 2, memberCount: 8, createdAt: "2026-07-11T00:00:00.000Z", updatedAt: "2026-07-11T00:00:00.000Z" },
              ],
            },
            requestId: "stores-request",
            timestamp: "2026-07-11T00:00:00.000Z",
          });
        }

        return Response.json({
          code: 0,
          message: "success",
          data: {
            items: [{
              id: "member-remote-store",
              memberNo: "M20260712000020",
              name: "周明轩",
              phoneMasked: "139****0020",
              gender: "MALE",
              status: "ACTIVE",
              storeId: "store_hangzhou",
              ownerEmployeeId: "emp_consultant_1",
              ownerName: "陈敏",
              source: "线上咨询",
              profileCompletenessPercent: 88,
              createdAt: "2026-07-11T01:00:00.000Z",
              updatedAt: "2026-07-11T02:00:00.000Z",
            }],
            page: 1,
            pageSize: 20,
            total: 1,
            hasNext: false,
          },
          requestId: "members-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }),
    );
    globalThis.React = React;
    const { MemberWorkbench } = await loadWorkbench();

    render(<MemberWorkbench employee={{ employeeId: "emp_manager_1", name: "P2", storeId: "store_shanghai", storeName: "上海人民广场店", roleCodes: ["store-manager"], permissions: ["member:read", "member:write"] }} />);

    const table = screen.getByRole("table");
    await within(table).findByText("周明轩");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByText("杭州西湖店")).toBeInTheDocument();
    expect(within(table).queryByText("store_hangzhou")).not.toBeInTheDocument();
    expect(await screen.findByRole("option", { name: "上海人民广场店" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "杭州西湖店" })).toBeInTheDocument();

    const detailButton = within(rows[1]).getByRole("button", { name: "查看详情" });
    fireEvent.click(detailButton);
    expect(await screen.findByRole("heading", { name: "周明轩 · 会员详情" })).toBeInTheDocument();
    expect(screen.getAllByText("个人资料").length).toBeGreaterThan(0);
    expect(screen.getAllByText("择偶要求").length).toBeGreaterThan(0);
  });

  it("keeps unfinished V1 modules out of the main workbench actions", async () => {
    globalThis.React = React;
    const { MemberWorkbench } = await loadWorkbench();

    render(<MemberWorkbench />);

    expect(screen.getByRole("button", { name: "新增会员" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "导出" })).not.toBeInTheDocument();
  });

  it("validates member details before submitting a new member", async () => {
    globalThis.React = React;
    const { MemberWorkbench } = await loadWorkbench();
    const fetchMock = vi.mocked(globalThis.fetch);

    render(<MemberWorkbench />);
    await screen.findByText("林晓雨");
    fireEvent.click(screen.getByRole("button", { name: "新增会员" }));

    expect(screen.getByText("姓名").textContent).toContain("*");
    expect(screen.getByText("归属员工").textContent).toContain("*");

    const phone = screen.getByRole("textbox", { name: /手机号/ });
    fireEvent.change(screen.getByRole("textbox", { name: /姓名/ }), { target: { value: "测试会员" } });
    fireEvent.change(phone, { target: { value: "138-1234-567" } });

    expect(phone).toHaveValue("1381234567");
    expect(screen.getByText("请输入 11 位大陆手机号，且应以 1 开头。")).toBeInTheDocument();
    expect(screen.getByText("选填，120 至 230 厘米的整数")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "学历" })).toHaveTextContent("初中及以下");
    expect(screen.getByRole("combobox", { name: "婚况" })).toHaveTextContent("离异");

    fireEvent.click(screen.getByRole("button", { name: "保存会员" }));

    expect(screen.getByText("请输入 11 位大陆手机号，且应以 1 开头。")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/v1/members" && init?.method === "POST")).toHaveLength(0);
  });

  it("lets managers select a readable owner for a new member", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/members/owners") {
        return Response.json({
          code: 0,
          message: "success",
          data: [
            { employeeId: "emp_consultant_1", name: "陈敏", roleName: "P1" },
            { employeeId: "emp_consultant_2", name: "王琳", roleName: "P1" },
          ],
          requestId: "owners-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }
      if (url === "/api/v1/members" && init?.method === "POST") {
        return Response.json({ code: 0, message: "success", data: {}, requestId: "create-request", timestamp: "2026-07-11T00:00:00.000Z" });
      }
      return Response.json({
        code: 0,
        message: "success",
        data: { items: [], page: 1, pageSize: 20, total: 0, hasNext: false },
        requestId: "members-request",
        timestamp: "2026-07-11T00:00:00.000Z",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    globalThis.React = React;
    const { MemberWorkbench } = await loadWorkbench();

    render(<MemberWorkbench employee={{ employeeId: "emp_manager_1", name: "门店店长", roleCodes: ["store-manager"], permissions: ["member:read", "member:write"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "新增会员" }));

    const dialog = await screen.findByRole("dialog");
    const owner = await within(dialog).findByRole("combobox", { name: "归属员工" });
    expect(owner).toHaveValue("emp_consultant_1");
    expect(within(dialog).getByRole("option", { name: "王琳（P1）" })).toBeInTheDocument();
    fireEvent.change(owner, { target: { value: "emp_consultant_2" } });
    fireEvent.change(screen.getByRole("textbox", { name: /姓名/ }), { target: { value: "测试会员" } });
    fireEvent.click(screen.getByRole("button", { name: "保存会员" }));

    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url) === "/api/v1/members" && init?.method === "POST")).toBe(true));
    const createCall = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/v1/members" && init?.method === "POST");
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({ ownerEmployeeId: "emp_consultant_2" });
  });

  it("lets staff choose a member owner", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/members/owners") {
        return Response.json({
          code: 0,
          message: "success",
          data: [
            { employeeId: "emp_consultant_1", name: "陈敏", roleName: "P1" },
            { employeeId: "emp_consultant_2", name: "王琳", roleName: "P1" },
          ],
          requestId: "owners-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }
      if (url === "/api/v1/members" && init?.method === "POST") {
        return Response.json({ code: 0, message: "success", data: {}, requestId: "create-request", timestamp: "2026-07-11T00:00:00.000Z" });
      }
      return Response.json({
        code: 0,
        message: "success",
        data: { items: [], page: 1, pageSize: 20, total: 0, hasNext: false },
        requestId: "members-request",
        timestamp: "2026-07-11T00:00:00.000Z",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    globalThis.React = React;
    const { MemberWorkbench } = await loadWorkbench();

    render(<MemberWorkbench employee={{ employeeId: "emp_consultant_1", name: "陈敏", roleCodes: ["staff"], permissions: ["member:read", "member:write"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "新增会员" }));

    const dialog = await screen.findByRole("dialog");
    const owner = await within(dialog).findByRole("combobox", { name: "归属员工" });
    expect(owner).toHaveValue("emp_consultant_1");
    fireEvent.change(owner, { target: { value: "emp_consultant_2" } });
    fireEvent.change(screen.getByRole("textbox", { name: /姓名/ }), { target: { value: "测试会员" } });
    fireEvent.click(screen.getByRole("button", { name: "保存会员" }));

    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url) === "/api/v1/members" && init?.method === "POST")).toBe(true));
    const createCall = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/v1/members" && init?.method === "POST");
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({ ownerEmployeeId: "emp_consultant_2" });
  });

  it("shows an owner selector to staff even when only one owner is available", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/members/owners") {
        return Response.json({
          code: 0,
          message: "success",
          data: {
            storeId: "store_1",
            items: [{ id: "emp_staff_1", name: "一线员工", roleName: "P1", roleCodes: ["staff"] }],
          },
          requestId: "owners-staff-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }
      if (url === "/api/v1/members" && init?.method === "POST") {
        return Response.json({ code: 0, message: "success", data: {}, requestId: "create-request", timestamp: "2026-07-11T00:00:00.000Z" });
      }
      return Response.json({
        code: 0,
        message: "success",
        data: { items: [], page: 1, pageSize: 20, total: 0, hasNext: false },
        requestId: "members-request",
        timestamp: "2026-07-11T00:00:00.000Z",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    globalThis.React = React;
    const { MemberWorkbench } = await loadWorkbench();

    render(<MemberWorkbench employee={{ employeeId: "emp_staff_1", name: "一线员工", roleCodes: ["staff"], permissions: ["member:read", "member:write"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "新增会员" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: "归属员工" })).toHaveValue("emp_staff_1");

    fireEvent.change(screen.getByRole("textbox", { name: /姓名/ }), { target: { value: "测试会员" } });
    fireEvent.click(screen.getByRole("button", { name: "保存会员" }));

    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url) === "/api/v1/members" && init?.method === "POST")).toBe(true));
    const createCall = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/v1/members" && init?.method === "POST");
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({ ownerEmployeeId: "emp_staff_1" });
  });

  it("shows a friendly database setup hint when member list loading fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            code: 2000,
            message: "Prisma database connection failed",
            data: null,
            requestId: "db-down",
            timestamp: "2026-07-11T00:00:00.000Z",
          },
          { status: 500 },
        ),
      ),
    );
    globalThis.React = React;
    const { MemberWorkbench } = await loadWorkbench();

    render(<MemberWorkbench />);

    expect(await screen.findByText(/Prisma database connection failed/)).toBeInTheDocument();
    expect(screen.getByText(/如当前环境没有真实数据库，请配置数据库并运行 pnpm seed 后重试/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
  });

  it("keeps empty and fallback copy polished for production use", () => {
    const source = readFileSync(path.join(process.cwd(), workbenchPath), "utf8");

    ["预留", "占位", "未完成", "后端详情接口完成后", "提交后将调用"].forEach((draftWord) => {
      expect(source).not.toContain(draftWord);
    });
    expect(source).toContain("暂无跟进记录，可先新增本次沟通内容。");
    expect(source).toContain("保存后刷新会员列表");
  });

  it("opens the member detail workspace and edits the personal profile", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.startsWith("/api/v1/areas")) {
        return Response.json({ code: 0, message: "success", data: [], requestId: "areas-request", timestamp: "2026-07-11T00:00:00.000Z" });
      }

      if (url === "/api/v1/stores") {
        return Response.json({
          code: 0,
          message: "success",
          data: {
            items: [
              { id: "store_jingan", name: "静安旗舰店", address: "上海市静安区", phone: "021-00000000", status: "ACTIVE", employeeCount: 2, memberCount: 1, createdAt: "2026-07-11T00:00:00.000Z", updatedAt: "2026-07-11T00:00:00.000Z" },
            ],
          },
          requestId: "stores-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      if (url.startsWith("/api/v1/members/member-1") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return Response.json({
          code: 0,
          message: "更新成功",
          data: {
            id: "member-1",
            memberNo: "MSTORE1001",
            name: body.name,
            phoneMasked: "139****0000",
            gender: body.gender ?? "FEMALE",
            status: body.status ?? "ACTIVE",
            storeId: body.storeId ?? "store_jingan",
            storeName: "静安旗舰店",
            ownerEmployeeId: body.ownerEmployeeId ?? "emp_consultant_1",
            ownerName: "陈敏",
            source: body.source ?? "walk-in",
            profileCompletenessPercent: 80,
            profile: {
              profileCompletenessPercent: 80,
              education: body.education ?? "本科",
              heightCm: body.heightCm,
              maritalStatus: body.maritalStatus ?? "未婚",
            },
            updatedAt: "2026-07-12T02:00:00.000Z",
          },
          requestId: "update-member-request",
          timestamp: "2026-07-12T00:00:00.000Z",
        });
      }

      if (url.startsWith("/api/v1/members/member-1")) {
        return Response.json({
          code: 0,
          message: "success",
          data: {
            id: "member-1",
            memberNo: "MSTORE1001",
            name: "林晓雨",
            phoneMasked: "138****6210",
            emailMasked: "li***@example.com",
            gender: "FEMALE",
            status: "ACTIVE",
            storeId: "store_jingan",
            ownerEmployeeId: "emp_consultant_1",
            source: "walk-in",
            profileCompletenessPercent: 72,
            profile: {
              profileCompletenessPercent: 72,
              education: "本科",
              maritalStatus: "未婚",
              expectationSummary: "希望稳定沟通",
            },
            followups: [
              {
                id: "followup-1",
                memberId: "member-1",
                method: "PHONE",
                content: "已完成首次回访",
                nextAction: "邀约到店",
                createdAt: "2026-07-11T03:00:00.000Z",
              },
            ],
            documents: [],
            createdAt: "2026-07-11T01:00:00.000Z",
            updatedAt: "2026-07-11T02:00:00.000Z",
          },
          requestId: "detail-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      if (url.startsWith("/api/v1/blacklists")) {
        return Response.json({
          code: 0,
          message: "success",
          data: {
            items: [
              {
                id: "blacklist-1",
                memberId: "member-1",
                riskType: "CONTACT_DUPLICATE",
                reason: "联系方式命中复核名单",
                status: "ACTIVE",
                createdAt: "2026-07-11T04:00:00.000Z",
              },
            ],
            page: 1,
            pageSize: 10,
            total: 1,
            hasNext: false,
          },
          requestId: "blacklist-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      if (url.startsWith("/api/v1/audits")) {
        return Response.json({
          code: 0,
          message: "success",
          data: {
            items: [
              {
                id: "audit-1",
                action: "MEMBER_UPDATE",
                resourceType: "Member",
                resourceId: "member-1",
                createdAt: "2026-07-11T05:00:00.000Z",
              },
            ],
            page: 1,
            pageSize: 10,
            total: 1,
            hasNext: false,
          },
          requestId: "audit-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      return Response.json({
        code: 0,
        message: "success",
        data: {
          items: [
            {
              id: "member-1",
              memberNo: "MSTORE1001",
              name: "林晓雨",
              phoneMasked: "138****6210",
              gender: "FEMALE",
              status: "ACTIVE",
              storeId: "store_jingan",
              ownerEmployeeId: "emp_consultant_1",
              source: "walk-in",
              profileCompletenessPercent: 72,
              createdAt: "2026-07-11T01:00:00.000Z",
              updatedAt: "2026-07-11T02:00:00.000Z",
            },
          ],
          page: 1,
          pageSize: 10,
          total: 1,
          hasNext: false,
        },
        requestId: "list-request",
        timestamp: "2026-07-11T00:00:00.000Z",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    globalThis.React = React;
    const { MemberWorkbench } = await loadWorkbench();

    render(<MemberWorkbench />);

    fireEvent.click((await screen.findAllByRole("button", { name: "查看详情" }))[0]);

    expect(await screen.findByRole("heading", { name: "林晓雨 · 会员详情" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getAllByText("MSTORE1001").length).toBeGreaterThan(0);
    expect(screen.getAllByText("个人资料").length).toBeGreaterThan(0);
    expect(screen.getAllByText("择偶要求").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "业务记录" }));
    expect(await screen.findByText("跟进记录")).toBeInTheDocument();
    expect(screen.getByText("已完成首次回访")).toBeInTheDocument();
    expect(screen.getByText("黑名单记录")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "个人资料" }));

    fireEvent.click(screen.getByRole("button", { name: "编辑资料" }));
    fireEvent.change(screen.getByRole("textbox", { name: "姓名" }), { target: { value: "林小雨" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: "身高 cm" }), { target: { value: "168" } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url) === "/api/v1/members/member-1" && init?.method === "PATCH")).toBe(true));
    const updateCall = fetchMock.mock.calls.find(([url, init]) => String(url) === "/api/v1/members/member-1" && init?.method === "PATCH");
    expect(JSON.parse(String(updateCall?.[1]?.body))).toMatchObject({ name: "林小雨", heightCm: 168 });
    expect(await screen.findByText("80%")).toBeInTheDocument();
  });

  it("asks for confirmation before deleting a member", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/v1/members/member-1" && init?.method === "DELETE") {
        return Response.json({
          code: 0,
          message: "删除成功",
          data: { id: "member-1" },
          requestId: "delete-member-request",
          timestamp: "2026-07-12T00:00:00.000Z",
        });
      }

      if (url.startsWith("/api/v1/members/member-1")) {
        return Response.json({
          code: 0,
          message: "success",
          data: {
            id: "member-1",
            memberNo: "MSTORE1001",
            name: "林晓雨",
            phoneMasked: "138****6210",
            gender: "FEMALE",
            status: "ACTIVE",
            storeId: "store_jingan",
            ownerEmployeeId: "emp_consultant_1",
            profile: { profileCompletenessPercent: 72 },
            createdAt: "2026-07-11T01:00:00.000Z",
            updatedAt: "2026-07-11T02:00:00.000Z",
          },
          requestId: "detail-request",
          timestamp: "2026-07-11T00:00:00.000Z",
        });
      }

      if (url === "/api/v1/members/owners") {
        return Response.json({ code: 0, message: "success", data: { items: [] }, requestId: "owners-request", timestamp: "2026-07-11T00:00:00.000Z" });
      }

      if (url === "/api/v1/stores") {
        return Response.json({ code: 0, message: "success", data: { items: [] }, requestId: "stores-request", timestamp: "2026-07-11T00:00:00.000Z" });
      }

      return Response.json({
        code: 0,
        message: "success",
        data: {
          items: [{
            id: "member-1",
            memberNo: "MSTORE1001",
            name: "林晓雨",
            phoneMasked: "138****6210",
            gender: "FEMALE",
            status: "ACTIVE",
            storeId: "store_jingan",
            ownerEmployeeId: "emp_consultant_1",
            profileCompletenessPercent: 72,
            createdAt: "2026-07-11T01:00:00.000Z",
            updatedAt: "2026-07-11T02:00:00.000Z",
          }],
          page: 1,
          pageSize: 10,
          total: 1,
          hasNext: false,
        },
        requestId: "list-request",
        timestamp: "2026-07-11T00:00:00.000Z",
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    globalThis.React = React;
    const { MemberWorkbench } = await loadWorkbench();

    render(<MemberWorkbench employee={{ employeeId: "emp_owner", name: "P3", roleCodes: ["admin"], permissions: ["member:read", "member:write", "member:delete"] }} />);

    fireEvent.click((await screen.findAllByRole("button", { name: "查看详情" }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: "删除会员" }));

    expect(confirmSpy).toHaveBeenCalledWith("确认删除会员「林晓雨」？删除后不可恢复。");
    await vi.waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => String(url) === "/api/v1/members/member-1" && init?.method === "DELETE")).toBe(true));
    await vi.waitFor(() => expect(screen.queryByText("林晓雨 · 会员详情")).not.toBeInTheDocument());
  });
});
