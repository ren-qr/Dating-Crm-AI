"use client";

import Link from "next/link";
import { signIn, signOut } from "next-auth/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { AiQueryAssistantFloatingEntry, AiQueryAssistantPage } from "@/interface/web/components/ai-query-assistant";
import { MemberWorkbench } from "@/interface/web/components/member-workbench";
import type { MemberQuickFillRequest } from "@/interface/web/components/member-workbench";
import {
  ApiError,
  CreateStaffInput,
  CurrentEmployee,
  DashboardOverview,
  StaffAccount,
  StoreAccount,
  canManageStaff,
  canUse,
  createStaffAccount,
  createStore,
  deleteStaffAccount,
  deleteStore,
  fetchStaffAccounts,
  fetchCurrentEmployee,
  fetchDashboardOverview,
  fetchStores,
  signOutToCurrentOrigin,
  staffLevelLabel,
  staffLevelOf,
  updateStaffAccount,
  updateStore,
} from "@/interface/shared/legacy-client/members";
import {
  type AiProviderConfig,
  type AiSettings,
  fetchAiConfig,
  fetchAiSettings,
  saveAiSettings,
} from "@/interface/shared/client/ai-settings";

const navItems = [
  { key: "dashboard", label: "概览", permission: "member:read", description: "经营指标与今日待办" },
  { key: "members", label: "会员档案", permission: "member:read", description: "查询、创建与跟进会员" },
  { key: "followups", label: "跟进回访", permission: "followup:read", description: "今日回访与服务动作" },
  { key: "blacklist", label: "黑名单", permission: "blacklist:read", description: "风险记录与拦截状态" },
  { key: "audit", label: "审计", permission: "audit:read", description: "最近操作留痕" },
  { key: "ai", label: "AI 助理", permission: "member:read", description: "会员查询条件快速生成" },
  { key: "staff", label: "人员管理", permission: "staff:read", description: "员工账号、角色与可管理范围" },
  { key: "stores", label: "门店管理", permission: "role:write", description: "门店参数与运营范围配置" },
  { key: "settings", label: "系统设置", permission: "role:write", description: "AI 模型配置状态与部署说明" },
] as const;

const COMPANY_NAME = "Meetra";
const STAFF_EMAIL_DOMAIN = "@meetra.local";

type ActiveModule = (typeof navItems)[number]["key"];

export default function Home() {
  const [employee, setEmployee] = useState<CurrentEmployee | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardOverview | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [activeModule, setActiveModule] = useState<ActiveModule>("dashboard");
  const [quickFillRequest, setQuickFillRequest] = useState<MemberQuickFillRequest | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadEmployee() {
      setAuthLoading(true);
      setAuthError(null);

      try {
        const current = await fetchCurrentEmployee();
        if (!ignore) {
          setEmployee(current);
        }
      } catch (error) {
        if (!ignore) {
          setEmployee(null);
          setAuthError(formatShellError(error));
        }
      } finally {
        if (!ignore) {
          setAuthLoading(false);
        }
      }
    }

    loadEmployee();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadDashboard() {
      if (!employee) {
        setDashboard(null);
        setDashboardLoading(false);
        return;
      }

      setDashboardLoading(true);
      setDashboardError(null);
      try {
        const overview = await fetchDashboardOverview();
        if (!ignore) {
          setDashboard(overview);
        }
      } catch (error) {
        if (!ignore) {
          setDashboard(null);
          setDashboardError(formatDashboardError(error));
        }
      } finally {
        if (!ignore) {
          setDashboardLoading(false);
        }
      }
    }

    loadDashboard();
    return () => {
      ignore = true;
    };
  }, [employee]);

  const visiblePermissions = useMemo(() => employee?.permissions.slice(0, 4) ?? [], [employee]);
  const memberReadable = employee ? canUse("member:read", employee) : true;
  const visibleNavItems = useMemo(() => navItems.filter((item) => shouldShowNavItem(item.key, employee)), [employee]);
  const activeNav = visibleNavItems.find((item) => item.key === activeModule) ?? visibleNavItems[0] ?? navItems[0];
  const metrics = dashboard
    ? [
        { label: "会员总数", value: dashboard.memberTotal, hint: "当前可用会员档案" },
        { label: "今日新增会员", value: dashboard.newMembersToday, hint: "今日创建的会员档案" },
        { label: "待跟进", value: dashboard.followupsDueToday, hint: "今日需完成回访的会员" },
        { label: "资料待补齐", value: dashboard.profileIncomplete, hint: "需要补全资料的会员" },
      ]
    : [];

  function startAiQuery(text: string) {
    setQuickFillRequest({ id: `${Date.now()}-${text}`, text });
    setActiveModule("members");
  }

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[240px_1fr]">
        <aside className="border-r border-zinc-200 bg-zinc-950 text-white">
          <div className="flex h-16 items-center border-b border-white/10 px-5">
            <div>
              <p className="text-base font-semibold">{COMPANY_NAME}</p>
              <p className="mt-0.5 text-xs text-zinc-400">门店运营后台</p>
            </div>
          </div>
          <nav className="space-y-1 px-3 py-4">
            {visibleNavItems.map((item) => {
              const enabled = employee ? isNavItemEnabled(item.key, employee) : true;
              const active = item.key === activeModule;

              return (
                <button
                  key={item.label}
                  className={`flex min-h-10 w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                    active
                      ? "bg-white text-zinc-950"
                      : enabled
                        ? "text-zinc-300 hover:bg-white/10 hover:text-white"
                        : "cursor-not-allowed text-zinc-600"
                  }`}
                  type="button"
                  onClick={() => {
                    if (enabled) setActiveModule(item.key);
                  }}
                  aria-disabled={!enabled}
                  aria-current={active ? "page" : undefined}
                >
                  <span>{item.label}</span>
                  {item.key === "blacklist" && dashboard ? <span className={active ? "text-xs text-red-700" : "text-xs text-amber-300"}>{dashboard.activeBlacklistCount}</span> : null}
                  {!enabled ? <span className="text-[10px] text-zinc-500">无权限</span> : null}
                </button>
              );
            })}
          </nav>
          <div className="mx-3 mt-3 border-t border-white/10 pt-4 text-xs text-zinc-400">
            <p>{authLoading ? "正在读取登录态..." : employee ? `当前员工：${employee.name ?? employee.email ?? "未命名员工"}` : "未登录或会话已过期"}</p>
            {employee ? <p className="mt-2">门店：{employee.storeName ?? storeLabel(employee.storeId)}</p> : null}
            {employee ? <p className="mt-2">角色：{staffLevelLabel(employee)}</p> : null}
            <p className="mt-2 break-words">权限：{visiblePermissions.length > 0 ? visiblePermissions.join(" · ") : "暂无权限信息"}</p>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="flex min-h-16 flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div>
              <h1 className="text-lg font-semibold">{activeNav.label}</h1>
              <p className="text-xs text-zinc-500">{activeNav.description}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {employee ? (
                <button
                  className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  type="button"
                  onClick={() => signOutToCurrentOrigin(signOut)}
                >
                  退出登录
                </button>
              ) : (
                <Link
                  href="/api/auth/signin"
                  className="inline-flex h-9 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  登录入口
                </Link>
              )}
              <div className="flex h-9 items-center gap-2 rounded-md bg-zinc-950 px-3 text-sm text-white">
                <span className={`h-2 w-2 rounded-full ${employee ? "bg-emerald-400" : authLoading ? "bg-amber-300" : "bg-red-400"}`} />
                {employee ? employee.name ?? employee.email ?? "当前员工" : authLoading ? "校验会话中" : "未登录"}
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-auto bg-zinc-100 p-4 sm:p-5">
            {!authLoading && !employee ? (
              <LoginPanel error={authError} />
            ) : null}
            {employee && !memberReadable ? <ShellNotice title="无权限状态" text="当前员工缺少 member:read，会员工作台会锁定读取能力；请联系管理员补充分配权限码。" /> : null}
            {employee && dashboardError ? <ShellNotice title="概览加载失败" text={dashboardError} /> : null}

            <div className="mt-4">
              {activeModule === "dashboard" ? <DashboardView dashboard={dashboard} loading={dashboardLoading} metrics={metrics} onOpenMembers={() => setActiveModule("members")} /> : null}
              {activeModule === "members" ? <MemberWorkbench employee={employee ?? undefined} quickFillRequest={quickFillRequest} /> : null}
              {activeModule === "followups" ? <FollowupView dashboard={dashboard} loading={dashboardLoading} onOpenMembers={() => setActiveModule("members")} /> : null}
              {activeModule === "blacklist" ? <BlacklistView dashboard={dashboard} loading={dashboardLoading} onOpenMembers={() => setActiveModule("members")} /> : null}
              {activeModule === "audit" ? <AuditView dashboard={dashboard} loading={dashboardLoading} /> : null}
              {activeModule === "ai" ? <AiQueryAssistantPage onStartQuery={startAiQuery} /> : null}
              {activeModule === "staff" ? <StaffManagementView employee={employee} /> : null}
              {activeModule === "stores" ? <StoreManagementView employee={employee} /> : null}
              {activeModule === "settings" ? <SettingsView employee={employee} /> : null}
            </div>
          </div>
        </section>
      </div>
      {employee && memberReadable ? <AiQueryAssistantFloatingEntry onStartQuery={startAiQuery} /> : null}
    </main>
  );
}

function shouldShowNavItem(key: ActiveModule, employee: CurrentEmployee | null) {
  if (key === "staff") {
    return canManageStaff(employee);
  }

  if (key === "stores" || key === "settings") {
    return staffLevelOf(employee) === "manager";
  }

  return true;
}

function isNavItemEnabled(key: ActiveModule, employee: CurrentEmployee) {
  if (key === "staff") {
    return canManageStaff(employee);
  }

  if (key === "stores" || key === "settings") {
    return staffLevelOf(employee) === "manager";
  }

  const item = navItems.find((navItem) => navItem.key === key);
  return item ? canUse(item.permission, employee) : false;
}

function ShellNotice({ title, text }: { title: string; text: string }) {
  return (
    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <span className="font-semibold">{title}</span>
      <span className="ml-2">{text}</span>
    </div>
  );
}

function DashboardView({
  dashboard,
  loading,
  metrics,
  onOpenMembers,
}: {
  dashboard: DashboardOverview | null;
  loading: boolean;
  metrics: { label: string; value: number; hint: string }[];
  onOpenMembers: () => void;
}) {
  return (
    <div className="space-y-4">
      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">今日运营总览</h2>
            <p className="mt-1 text-sm text-zinc-500">门店会员、回访、资料与风险状态集中在这里。</p>
          </div>
          <button className="h-9 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800" type="button" onClick={onOpenMembers}>
            进入会员档案
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loading ? Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-md border border-zinc-200 bg-white p-4" aria-label="正在加载概览数据" />
        )) : null}
        {!loading && !dashboard ? (
          <div className="col-span-full rounded-md border border-zinc-200 bg-white p-4 text-sm text-zinc-500">暂无可展示的运营概览数据。</div>
        ) : null}
        {!loading && metrics.map((metric) => (
          <div key={metric.label} className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium text-zinc-500">{metric.label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-normal">{metric.value}</p>
            <p className="mt-1 text-xs text-zinc-500">{metric.hint}</p>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,0.7fr)]">
        <div className="rounded-md border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold">待处理事项</h3>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <StatusBlock label="今日回访" value={dashboard?.followupsDueToday ?? 0} />
            <StatusBlock label="资料待补齐" value={dashboard?.profileIncomplete ?? 0} />
            <StatusBlock label="风险复核" value={dashboard?.activeBlacklistCount ?? 0} tone={dashboard?.activeBlacklistCount ? "danger" : "neutral"} />
          </div>
        </div>
        <AuditSummary dashboard={dashboard} loading={loading} />
      </section>
    </div>
  );
}

function FollowupView({ dashboard, loading, onOpenMembers }: { dashboard: DashboardOverview | null; loading: boolean; onOpenMembers: () => void }) {
  return (
    <ModulePanel title="跟进回访工作台" subtitle="当前版本先汇总今日待办，具体跟进操作在会员详情内完成。">
      {loading ? <p className="text-sm text-zinc-500">正在加载待办...</p> : null}
      {!loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatusBlock label="今日需回访" value={dashboard?.followupsDueToday ?? 0} />
          <StatusBlock label="会员总数" value={dashboard?.memberTotal ?? 0} />
          <StatusBlock label="资料待补齐" value={dashboard?.profileIncomplete ?? 0} />
        </div>
      ) : null}
      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        请选择会员档案中的某位会员，打开详情后新增电话、微信、到店等跟进记录。
      </div>
      <button className="mt-4 h-9 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800" type="button" onClick={onOpenMembers}>
        打开会员档案
      </button>
    </ModulePanel>
  );
}

function BlacklistView({ dashboard, loading, onOpenMembers }: { dashboard: DashboardOverview | null; loading: boolean; onOpenMembers: () => void }) {
  return (
    <ModulePanel title="黑名单复核" subtitle="查看风险数量，并从会员详情登记人工风险或复核记录。">
      {loading ? <p className="text-sm text-zinc-500">正在加载风险状态...</p> : null}
      {!loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatusBlock label="生效风险记录" value={dashboard?.activeBlacklistCount ?? 0} tone={dashboard?.activeBlacklistCount ? "danger" : "neutral"} />
          <StatusBlock label="会员总数" value={dashboard?.memberTotal ?? 0} />
          <StatusBlock label="今日新增会员" value={dashboard?.newMembersToday ?? 0} />
        </div>
      ) : null}
      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
        黑名单登记入口已在会员详情抽屉中开放；命中风险后会进入审计留痕。
      </div>
      <button className="mt-4 h-9 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800" type="button" onClick={onOpenMembers}>
        去会员详情登记
      </button>
    </ModulePanel>
  );
}

function AuditView({ dashboard, loading }: { dashboard: DashboardOverview | null; loading: boolean }) {
  return (
    <ModulePanel title="审计留痕" subtitle="展示最近的关键操作记录，后续会扩展筛选与导出。">
      <AuditSummary dashboard={dashboard} loading={loading} expanded />
    </ModulePanel>
  );
}

function StaffManagementView({ employee }: { employee: CurrentEmployee | null }) {
  const level = staffLevelOf(employee);
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateStaffInput>({
    email: "",
    name: "",
    password: "",
    roleLevel: "staff",
  });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [staffEdits, setStaffEdits] = useState<Record<string, { name: string; email: string; storeId: string }>>({});
  const [stores, setStores] = useState<StoreAccount[]>([]);
  const roleCards = [
    { title: "管理员", text: "可管理门店、员工和系统配置，并可编辑全部会员。" },
    { title: "员工", text: "可查看全部会员，仅可编辑自己归属的会员。" },
  ];
  const roleOptions = [{ value: "staff", label: "员工" }];
  const storeOptions = level === "manager"
    ? stores
    : [{
        id: employee?.storeId ?? "",
        name: employee?.storeName ?? storeLabel(employee?.storeId),
        address: "",
        phone: "",
        status: "ACTIVE",
        employeeCount: 0,
        memberCount: 0,
        createdAt: "",
        updatedAt: "",
      }].filter((store) => store.id);

  function storeNameOf(storeId?: string | null) {
    if (storeId && storeId === employee?.storeId && employee.storeName) {
      return employee.storeName;
    }

    return stores.find((store) => store.id === storeId)?.name ?? storeLabel(storeId);
  }

  const currentStoreName = storeNameOf(employee?.storeId);
  const scopeSummary = level === "manager" ? "所有门店" : currentStoreName;

  useEffect(() => {
    let ignore = false;

    async function loadStaff() {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchStaffAccounts();
        if (!ignore) {
          setStaff(result.items);
          setStaffEdits(Object.fromEntries(result.items.map((account) => [account.id, {
            name: account.name,
            email: account.email,
            storeId: account.storeId,
          }])));
        }
      } catch (loadError) {
        if (!ignore) {
          setStaff([]);
          setError(formatShellError(loadError));
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadStaff();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (level !== "manager") return;

    let ignore = false;

    async function loadStores() {
      try {
        const result = await fetchStores();
        if (!ignore) {
          setStores(result.items);
          setForm((current) => ({
            ...current,
            storeId: current.storeId || result.items[0]?.id || employee?.storeId || "",
          }));
        }
      } catch {
        if (!ignore && employee?.storeId) {
          setStores([{
            id: employee.storeId,
            name: employee.storeName ?? storeLabel(employee.storeId),
            address: "",
            phone: "",
            status: "ACTIVE",
            employeeCount: 0,
            memberCount: 0,
            createdAt: "",
            updatedAt: "",
          }]);
        }
      }
    }

    loadStores();
    return () => {
      ignore = true;
    };
  }, [employee?.storeId, employee?.storeName, level]);

  async function submitStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);

    if (!form.email || !form.name || form.password.length < 8) {
      setFormError("请填写姓名、邮箱前缀，并设置至少 8 位密码。");
      setSaving(false);
      return;
    }

    try {
      const email = form.email.includes("@") ? form.email : `${form.email}${STAFF_EMAIL_DOMAIN}`;
      const created = await createStaffAccount({
        ...form,
        email,
        storeId: level === "manager" ? form.storeId || employee?.storeId || undefined : employee?.storeId || undefined,
      });
      setStaff((current) => [created, ...current]);
      setStaffEdits((current) => ({
        ...current,
        [created.id]: { name: created.name, email: created.email, storeId: created.storeId },
      }));
      setForm({
        email: "",
        name: "",
        password: "",
        roleLevel: "staff",
        storeId: level === "manager" ? form.storeId : employee?.storeId ?? "",
      });
      setShowCreateForm(false);
    } catch (createError) {
      setFormError(formatShellError(createError));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(account: StaffAccount) {
    setUpdatingId(account.id);
    setError(null);

    try {
      const updated = await updateStaffAccount(account.id, { status: account.status === "ACTIVE" ? "DISABLED" : "ACTIVE" });
      setStaff((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setStaffEdits((current) => ({
        ...current,
        [updated.id]: { name: updated.name, email: updated.email, storeId: updated.storeId },
      }));
    } catch (updateError) {
      setError(formatShellError(updateError));
    } finally {
      setUpdatingId(null);
    }
  }

  async function changeRole(account: StaffAccount, roleLevel: "manager" | "staff") {
    setUpdatingId(account.id);
    setError(null);

    try {
      const updated = await updateStaffAccount(account.id, { roleLevel });
      setStaff((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setStaffEdits((current) => ({
        ...current,
        [updated.id]: { name: updated.name, email: updated.email, storeId: updated.storeId },
      }));
    } catch (updateError) {
      setError(formatShellError(updateError));
    } finally {
      setUpdatingId(null);
    }
  }

  function canEditIdentity(account: StaffAccount) {
    if (level === "manager") return true;
    return account.id === employee?.employeeId;
  }

  async function saveAccount(account: StaffAccount) {
    const edit = staffEdits[account.id];
    if (!edit) return;

    setUpdatingId(account.id);
    setError(null);

    try {
      const updated = await updateStaffAccount(account.id, {
        name: edit.name,
        email: edit.email,
        ...(level === "manager" ? { storeId: edit.storeId } : {}),
      });
      setStaff((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setStaffEdits((current) => ({
        ...current,
        [updated.id]: { name: updated.name, email: updated.email, storeId: updated.storeId },
      }));
    } catch (updateError) {
      setError(formatShellError(updateError));
    } finally {
      setUpdatingId(null);
    }
  }

  async function removeAccount(account: StaffAccount) {
    if (!window.confirm(`确认删除员工账号「${account.name}」？删除后不可恢复。`)) {
      return;
    }

    setUpdatingId(account.id);
    setError(null);

    try {
      await deleteStaffAccount(account.id);
      setStaff((current) => current.filter((item) => item.id !== account.id));
      setStaffEdits((current) => {
        const next = { ...current };
        delete next[account.id];
        return next;
      });
    } catch (removeError) {
      setError(formatShellError(removeError));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <ModulePanel
      title="人员管理"
      subtitle="管理员工账号、角色层级与启用状态。"
      action={(
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-zinc-950 px-2 py-1 font-medium text-white">当前职级：{staffLevelLabel(employee)}</span>
          <span className="rounded bg-zinc-100 px-2 py-1 font-medium text-zinc-700">管理范围：{scopeSummary}</span>
        </div>
      )}
    >
      <section className="rounded-md border border-zinc-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">员工账号列表</h3>
            <p className="mt-1 text-xs text-zinc-500">{loading ? "正在读取员工账号" : `${staff.length} 个账号`}</p>
          </div>
          <button
            className="h-9 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white hover:bg-zinc-800"
            type="button"
            onClick={() => setShowCreateForm((current) => !current)}
          >
            {showCreateForm ? "收起新增" : "新增账号"}
          </button>
        </div>
        {error ? <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        {showCreateForm ? (
          <form className="grid gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-4 md:grid-cols-2 xl:grid-cols-5" onSubmit={submitStaff}>
            <label className="block text-xs font-medium text-zinc-700">
              姓名
              <input className="mt-1 h-10 w-full rounded-md border-zinc-300 bg-white px-3 text-sm leading-none" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label className="block text-xs font-medium text-zinc-700 xl:col-span-2">
              邮箱
              <div className="mt-1 flex h-10 overflow-hidden rounded-md border border-zinc-300 bg-white">
                <input aria-label="邮箱" className="min-w-0 flex-1 border-0 px-3 text-sm leading-none focus:ring-0" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value.replace(STAFF_EMAIL_DOMAIN, "") }))} />
                <span className="flex shrink-0 items-center border-l border-zinc-200 bg-white px-3 text-sm text-zinc-500">{STAFF_EMAIL_DOMAIN}</span>
              </div>
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              初始密码
              <input className="mt-1 h-10 w-full rounded-md border-zinc-300 bg-white px-3 text-sm leading-none" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
            </label>
            <label className="block text-xs font-medium text-zinc-700">
              角色
              <select className="mt-1 h-10 w-full rounded-md border-zinc-300 bg-white px-3 text-sm leading-none" value={form.roleLevel} onChange={(event) => setForm((current) => ({ ...current, roleLevel: event.target.value as CreateStaffInput["roleLevel"] }))}>
                {roleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-zinc-700 md:col-span-2 xl:col-span-2">
              所属门店
              <select className="mt-1 h-10 w-full rounded-md border-zinc-300 bg-white px-3 text-sm leading-none" value={form.storeId ?? employee?.storeId ?? ""} onChange={(event) => setForm((current) => ({ ...current, storeId: event.target.value }))} disabled={level !== "manager"}>
                {storeOptions.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </label>
            <div className="flex items-end gap-2 md:col-span-2 xl:col-span-3">
              <button className="h-10 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={saving}>
                {saving ? "创建中..." : "创建账号"}
              </button>
              <button className="h-10 rounded-md border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50" type="button" onClick={() => setShowCreateForm(false)}>
                取消
              </button>
              {formError ? <p className="text-xs text-red-700">{formError}</p> : null}
            </div>
          </form>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                {["姓名", "邮箱", "对应门店", "职级", "状态", "创建时间", "操作"].map((head) => <th key={head} className="border-b border-zinc-200 px-3 py-2 font-medium">{head}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? <StaffRowState text="正在读取员工账号..." /> : null}
              {!loading && staff.length === 0 ? <StaffRowState text="暂无可管理账号。" /> : null}
              {!loading && staff.map((account) => (
                <tr key={account.id} className="hover:bg-zinc-50">
                  <td className="border-b border-zinc-100 px-3 py-2 font-medium text-zinc-900">
                    {canEditIdentity(account) ? (
                      <input
                        aria-label={`${account.name} 姓名`}
                        className="h-8 w-full min-w-24 rounded-md border-zinc-300 px-2 text-xs"
                        value={staffEdits[account.id]?.name ?? account.name}
                        onChange={(event) => setStaffEdits((current) => ({ ...current, [account.id]: { name: event.target.value, email: current[account.id]?.email ?? account.email, storeId: current[account.id]?.storeId ?? account.storeId } }))}
                      />
                    ) : account.name}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                    {canEditIdentity(account) ? (
                      <input
                        aria-label={`${account.name} 邮箱`}
                        className="h-8 w-full min-w-44 rounded-md border-zinc-300 px-2 text-xs"
                        type="email"
                        value={staffEdits[account.id]?.email ?? account.email}
                        onChange={(event) => setStaffEdits((current) => ({ ...current, [account.id]: { name: current[account.id]?.name ?? account.name, email: event.target.value, storeId: current[account.id]?.storeId ?? account.storeId } }))}
                      />
                    ) : account.email}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                    {level === "manager" ? (
                      <select
                        aria-label={`${account.name} 对应门店`}
                        className="h-8 w-full min-w-36 rounded-md border-zinc-300 bg-white px-2 text-xs"
                        value={staffEdits[account.id]?.storeId ?? account.storeId}
                        onChange={(event) => setStaffEdits((current) => ({ ...current, [account.id]: { name: current[account.id]?.name ?? account.name, email: current[account.id]?.email ?? account.email, storeId: event.target.value } }))}
                      >
                        {!storeOptions.some((store) => store.id === (staffEdits[account.id]?.storeId ?? account.storeId)) ? <option value={staffEdits[account.id]?.storeId ?? account.storeId}>{storeNameOf(staffEdits[account.id]?.storeId ?? account.storeId)}</option> : null}
                        {storeOptions.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                      </select>
                    ) : storeNameOf(account.storeId)}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">
                    {level === "manager" && account.id !== employee?.employeeId ? (
                      <select
                        aria-label={`${account.name} 职级`}
                        className="h-8 min-w-24 rounded-md border-zinc-300 bg-white px-2 text-xs leading-none"
                        value={account.roleLevel === "manager" ? "manager" : "staff"}
                        disabled={updatingId === account.id}
                        onChange={(event) => changeRole(account, event.target.value as "manager" | "staff")}
                      >
                        <option value="manager">管理员</option>
                        <option value="staff">员工</option>
                      </select>
                    ) : account.roleName}
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2">
                    <span className={account.status === "ACTIVE" ? "rounded bg-emerald-50 px-2 py-1 font-medium text-emerald-700" : "rounded bg-zinc-100 px-2 py-1 font-medium text-zinc-500"}>
                      {account.status === "ACTIVE" ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-500">{formatAuditTime(account.createdAt)}</td>
                  <td className="border-b border-zinc-100 px-3 py-2">
                    <button
                      className="h-8 rounded-md border border-zinc-300 px-2 font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                      type="button"
                      disabled={account.id === employee?.employeeId || updatingId === account.id}
                      onClick={() => toggleStatus(account)}
                    >
                      {account.status === "ACTIVE" ? "停用" : "启用"}
                    </button>
                    {canEditIdentity(account) ? (
                      <button
                        className="ml-2 h-8 rounded-md bg-zinc-950 px-2 font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                        type="button"
                        disabled={updatingId === account.id}
                        onClick={() => saveAccount(account)}
                      >
                        保存
                      </button>
                    ) : null}
                    {level !== "staff" && account.id !== employee?.employeeId ? (
                      <button
                        className="ml-2 h-8 rounded-md border border-red-200 px-2 font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                        type="button"
                        disabled={updatingId === account.id}
                        onClick={() => removeAccount(account)}
                      >
                        删除
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {roleCards.map((card) => (
          <div key={card.title} className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
            <h3 className="text-sm font-semibold">{card.title}</h3>
            <p className="mt-2 text-sm text-zinc-600">{card.text}</p>
          </div>
        ))}
      </section>

    </ModulePanel>
  );
}

function StaffRowState({ text }: { text: string }) {
  return (
    <tr>
      <td className="border-b border-zinc-100 px-3 py-8 text-center text-zinc-500" colSpan={7}>{text}</td>
    </tr>
  );
}

function StoreManagementView({ employee }: { employee: CurrentEmployee | null }) {
  const [stores, setStores] = useState<StoreAccount[]>([]);
  const [edits, setEdits] = useState<Record<string, { name: string; address: string; phone: string }>>({});
  const [form, setForm] = useState({ id: "", name: "", address: "", phone: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManageStores = canUse("role:write", employee);

  useEffect(() => {
    if (!canManageStores) {
      setLoading(false);
      return;
    }

    let ignore = false;

    async function loadStores() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchStores();
        if (!ignore) {
          setStores(result.items);
          setEdits(Object.fromEntries(result.items.map((store) => [store.id, {
            name: store.name,
            address: store.address,
            phone: store.phone,
          }])));
        }
      } catch (loadError) {
        if (!ignore) {
          setError(formatShellError(loadError));
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadStores();
    return () => {
      ignore = true;
    };
  }, [canManageStores]);

  async function submitStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.id || !form.name) {
      setError("请填写门店编号和门店名称。");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const created = await createStore(form);
      setStores((current) => [created, ...current]);
      setEdits((current) => ({
        ...current,
        [created.id]: { name: created.name, address: created.address, phone: created.phone },
      }));
      setForm({ id: "", name: "", address: "", phone: "" });
    } catch (createError) {
      setError(formatShellError(createError));
    } finally {
      setSaving(false);
    }
  }

  async function saveStore(store: StoreAccount) {
    const edit = edits[store.id];
    if (!edit) return;

    setUpdatingId(store.id);
    setError(null);
    try {
      const updated = await updateStore(store.id, edit);
      setStores((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEdits((current) => ({
        ...current,
        [updated.id]: { name: updated.name, address: updated.address, phone: updated.phone },
      }));
    } catch (updateError) {
      setError(formatShellError(updateError));
    } finally {
      setUpdatingId(null);
    }
  }

  async function toggleStore(store: StoreAccount) {
    setUpdatingId(store.id);
    setError(null);
    try {
      const updated = await updateStore(store.id, { status: store.status === "ACTIVE" ? "DISABLED" : "ACTIVE" });
      setStores((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (updateError) {
      setError(formatShellError(updateError));
    } finally {
      setUpdatingId(null);
    }
  }

  async function removeStore(store: StoreAccount) {
    setUpdatingId(store.id);
    setError(null);
    try {
      await deleteStore(store.id);
      setStores((current) => current.filter((item) => item.id !== store.id));
      setEdits((current) => {
        const next = { ...current };
        delete next[store.id];
        return next;
      });
    } catch (deleteError) {
      setError(formatShellError(deleteError));
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <ModulePanel title="门店管理" subtitle="管理门店基础资料、启停状态与人员会员容量。">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <InfoTile label="当前角色" value={staffLevelLabel(employee)} />
        <InfoTile label="权限状态" value={canUse("role:write", employee) ? "可配置" : "只读"} />
        <InfoTile label="管理范围" value="全部门店" />
      </div>

      <section className="mt-4 rounded-md border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold">新增门店</h3>
        <form className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[160px_minmax(180px,1fr)_minmax(180px,1fr)_160px_auto]" onSubmit={submitStore}>
          <input aria-label="门店编号" className="h-10 rounded-md border-zinc-300 px-3 text-sm" placeholder="store-id" value={form.id} onChange={(event) => setForm((current) => ({ ...current, id: event.target.value }))} disabled={!canManageStores} />
          <input aria-label="门店名称" className="h-10 rounded-md border-zinc-300 px-3 text-sm" placeholder="门店名称" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} disabled={!canManageStores} />
          <input aria-label="门店地址" className="h-10 rounded-md border-zinc-300 px-3 text-sm" placeholder="地址" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} disabled={!canManageStores} />
          <input aria-label="门店电话" className="h-10 rounded-md border-zinc-300 px-3 text-sm" placeholder="电话" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} disabled={!canManageStores} />
          <button className="h-10 rounded-md bg-zinc-950 px-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40" type="submit" disabled={!canManageStores || saving}>
            {saving ? "创建中..." : "创建"}
          </button>
        </form>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </section>

      <section className="mt-4 rounded-md border border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h3 className="text-sm font-semibold">门店列表</h3>
          <span className="text-xs text-zinc-500">{loading ? "读取中" : `${stores.length} 个门店`}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs">
            <thead className="bg-zinc-50 text-zinc-500">
              <tr>
                {["编号", "名称", "地址", "电话", "员工/会员", "状态", "操作"].map((head) => <th key={head} className="border-b border-zinc-200 px-3 py-2 font-medium">{head}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading ? <StoreRowState text="正在读取门店..." /> : null}
              {!loading && stores.length === 0 ? <StoreRowState text="暂无门店。" /> : null}
              {!loading && stores.map((store) => (
                <tr key={store.id} className="hover:bg-zinc-50">
                  <td className="border-b border-zinc-100 px-3 py-2 font-medium text-zinc-900">{store.id}</td>
                  <td className="border-b border-zinc-100 px-3 py-2">
                    <input aria-label={`${store.id} 名称`} className="h-8 w-full min-w-32 rounded-md border-zinc-300 px-2 text-xs" value={edits[store.id]?.name ?? store.name} onChange={(event) => setEdits((current) => ({ ...current, [store.id]: { name: event.target.value, address: current[store.id]?.address ?? store.address, phone: current[store.id]?.phone ?? store.phone } }))} disabled={!canManageStores} />
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2">
                    <input aria-label={`${store.id} 地址`} className="h-8 w-full min-w-48 rounded-md border-zinc-300 px-2 text-xs" value={edits[store.id]?.address ?? store.address} onChange={(event) => setEdits((current) => ({ ...current, [store.id]: { name: current[store.id]?.name ?? store.name, address: event.target.value, phone: current[store.id]?.phone ?? store.phone } }))} disabled={!canManageStores} />
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2">
                    <input aria-label={`${store.id} 电话`} className="h-8 w-full min-w-32 rounded-md border-zinc-300 px-2 text-xs" value={edits[store.id]?.phone ?? store.phone} onChange={(event) => setEdits((current) => ({ ...current, [store.id]: { name: current[store.id]?.name ?? store.name, address: current[store.id]?.address ?? store.address, phone: event.target.value } }))} disabled={!canManageStores} />
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2 text-zinc-700">{store.employeeCount} / {store.memberCount}</td>
                  <td className="border-b border-zinc-100 px-3 py-2">
                    <span className={store.status === "ACTIVE" ? "rounded bg-emerald-50 px-2 py-1 font-medium text-emerald-700" : "rounded bg-zinc-100 px-2 py-1 font-medium text-zinc-500"}>
                      {store.status === "ACTIVE" ? "启用" : "停用"}
                    </span>
                  </td>
                  <td className="border-b border-zinc-100 px-3 py-2">
                    <button className="h-8 rounded-md bg-zinc-950 px-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={!canManageStores || updatingId === store.id} onClick={() => saveStore(store)}>保存</button>
                    <button className="ml-2 h-8 rounded-md border border-zinc-300 px-2 font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={!canManageStores || updatingId === store.id} onClick={() => toggleStore(store)}>{store.status === "ACTIVE" ? "停用" : "启用"}</button>
                    <button className="ml-2 h-8 rounded-md border border-red-200 px-2 font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40" type="button" disabled={!canManageStores || updatingId === store.id || store.employeeCount + store.memberCount > 0} onClick={() => removeStore(store)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </ModulePanel>
  );
}

function SettingsView({ employee }: { employee: CurrentEmployee | null }) {
  const [config, setConfig] = useState<AiProviderConfig | null>(null);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [form, setForm] = useState({ provider: "ollama" as AiSettings["provider"], ollamaBaseUrl: "http://127.0.0.1:11434", ollamaModel: "qwen3.6:35b", deepseekBaseUrl: "https://api.deepseek.com", deepseekModel: "deepseek-chat", deepseekApiKey: "" });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canManageAi = staffLevelOf(employee) === "manager";

  useEffect(() => {
    if (!canManageAi) {
      setLoading(false);
      return;
    }

    let ignore = false;

    async function loadConfig() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAiConfig();
        const saved = await fetchAiSettings();
        if (!ignore) {
          setConfig(result);
          setSettings(saved);
          setForm((current) => ({ ...current, ...saved }));
        }
      } catch (loadError) {
        if (!ignore) {
          setConfig(null);
          setError(formatShellError(loadError));
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadConfig();
    return () => {
      ignore = true;
    };
  }, [canManageAi]);

  const provider = config?.provider ?? null;
  const configured = Boolean(config?.configured ?? config?.enabled);

  async function saveSettings(provider: AiSettings["provider"]) {
    setSaving(true); setError(null);
    setSuccess(null);
    try {
      const saved = await saveAiSettings({ ...form, provider, ...(form.deepseekApiKey ? {} : { deepseekApiKey: undefined }) });
      setSettings(saved); setForm((current) => ({ ...current, ...saved, deepseekApiKey: "" }));
      const refreshed = await fetchAiConfig(); setConfig(refreshed);
      setSuccess(provider === "ollama" ? "本地模型配置保存成功，当前已使用本地模型。" : "云端模型配置保存成功，当前已使用云端模型。");
      window.setTimeout(() => setSuccess(null), 3000);
    } catch (saveError) { setError(formatShellError(saveError)); } finally { setSaving(false); }
  }

  return (
    <ModulePanel title="系统设置" subtitle="AI 管理：直接配置本地模型或云端模型，保存后立即生效。">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <InfoTile label="当前角色" value={staffLevelLabel(employee)} />
        <InfoTile label="权限状态" value={canManageAi ? "可查看配置" : "无权限"} />
        <InfoTile label="Provider" value={loading ? "读取中" : providerLabel(provider)} />
        <InfoTile label="Configured" value={loading ? "读取中" : configured ? "已配置" : "未配置"} />
      </div>

      {error ? <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{error}</div> : null}
      {success ? <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">{success}</div> : null}

      <section className="mt-4 rounded-md border border-zinc-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <section className="rounded-md border border-emerald-200 bg-emerald-50/40 p-4">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">本地模型配置</h3><span className="text-xs text-emerald-700">Ollama</span></div>
            <label className="mt-4 block text-xs text-zinc-600">服务地址<input className="mt-1 h-10 w-full rounded-md border-zinc-300 bg-white text-sm" value={form.ollamaBaseUrl} onChange={(e) => setForm({ ...form, ollamaBaseUrl: e.target.value })} /></label>
            <label className="mt-3 block text-xs text-zinc-600">模型名称<input className="mt-1 h-10 w-full rounded-md border-zinc-300 bg-white text-sm" value={form.ollamaModel} onChange={(e) => setForm({ ...form, ollamaModel: e.target.value })} /></label>
            <div className="mt-4 flex items-center justify-between gap-3"><span className={form.provider === "ollama" ? "text-xs font-medium text-emerald-700" : "text-xs text-zinc-500"}>{form.provider === "ollama" ? "当前使用中" : "未启用"}</span><button type="button" disabled={saving || loading} className="h-9 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white disabled:opacity-50" onClick={() => saveSettings("ollama")}>保存本地配置</button></div>
          </section>
          <section className="rounded-md border border-sky-200 bg-sky-50/40 p-4">
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">云端模型配置</h3><span className="text-xs text-sky-700">第三方服务</span></div>
            <label className="mt-4 block text-xs text-zinc-600">接口地址<input className="mt-1 h-10 w-full rounded-md border-zinc-300 bg-white text-sm" value={form.deepseekBaseUrl} onChange={(e) => setForm({ ...form, deepseekBaseUrl: e.target.value })} /></label>
            <label className="mt-3 block text-xs text-zinc-600">模型名称<input className="mt-1 h-10 w-full rounded-md border-zinc-300 bg-white text-sm" value={form.deepseekModel} onChange={(e) => setForm({ ...form, deepseekModel: e.target.value })} /></label>
            <label className="mt-3 block text-xs text-zinc-600">API Key {settings?.deepseekApiKeyConfigured ? "（已设置，留空保持不变）" : ""}<input type="password" autoComplete="new-password" className="mt-1 h-10 w-full rounded-md border-zinc-300 bg-white text-sm" value={form.deepseekApiKey} onChange={(e) => setForm({ ...form, deepseekApiKey: e.target.value })} placeholder="仅在需要更新时填写" /></label>
            <div className="mt-4 flex items-center justify-between gap-3"><span className={form.provider === "deepseek" ? "text-xs font-medium text-sky-700" : "text-xs text-zinc-500"}>{form.provider === "deepseek" ? "当前使用中" : "未启用"}</span><button type="button" disabled={saving || loading} className="h-9 rounded-md bg-sky-700 px-3 text-xs font-medium text-white disabled:opacity-50" onClick={() => saveSettings("deepseek")}>保存云端配置</button></div>
          </section>
        </div>
      </section>

      <section className="mt-4 rounded-md border border-zinc-200 bg-white p-4">
        <h3 className="text-sm font-semibold">部署提示</h3>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <SystemInfoLine label="开发预览" value="pnpm dev -- -H 0.0.0.0 -p 3002" />
          <SystemInfoLine label="生产运行" value="bash scripts/start-local-server.sh" />
          <SystemInfoLine label="后台停止" value="bash scripts/stop-local-server.sh" />
          <SystemInfoLine label="密钥位置" value="服务端 .env / 部署环境变量" />
        </div>
      </section>
    </ModulePanel>
  );
}

function providerLabel(provider?: AiProviderConfig["provider"] | null) {
  if (provider === "ollama") return "Ollama";
  if (provider === "deepseek") return "云端模型";
  if (provider === "mock") return "Mock";
  return "未启用";
}

function StoreRowState({ text }: { text: string }) {
  return (
    <tr>
      <td className="border-b border-zinc-100 px-3 py-8 text-center text-zinc-500" colSpan={7}>{text}</td>
    </tr>
  );
}

function SystemInfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 break-words font-mono text-xs text-zinc-900">{value}</p>
    </div>
  );
}

function InfoTile({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className={compact ? "bg-white p-3" : "rounded-md border border-zinc-200 bg-white p-3"}>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className={compact ? "mt-1 break-words text-sm font-semibold text-zinc-900" : "mt-2 break-words text-sm font-semibold text-zinc-900"}>{value}</p>
    </div>
  );
}

function ModulePanel({ title, subtitle, children, action }: { title: string; subtitle: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 border-b border-zinc-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="pt-4">{children}</div>
    </section>
  );
}

function StatusBlock({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "danger" }) {
  return (
    <div className={tone === "danger" ? "rounded-md border border-red-200 bg-red-50 p-3" : "rounded-md border border-zinc-200 bg-white p-3"}>
      <p className={tone === "danger" ? "text-xs font-medium text-red-600" : "text-xs font-medium text-zinc-500"}>{label}</p>
      <p className={tone === "danger" ? "mt-2 text-xl font-semibold text-red-700" : "mt-2 text-xl font-semibold text-zinc-900"}>{value}</p>
    </div>
  );
}

function AuditSummary({ dashboard, loading, expanded = false }: { dashboard: DashboardOverview | null; loading: boolean; expanded?: boolean }) {
  return (
    <div className={expanded ? "" : "rounded-md border border-zinc-200 bg-white p-4"}>
      <h3 className="text-sm font-semibold">最近审计</h3>
      {loading ? <p className="mt-3 text-xs text-zinc-500">正在加载审计记录...</p> : null}
      {!loading && dashboard && !Array.isArray(dashboard.recentAudits) ? <p className="mt-3 text-xs text-zinc-500">暂时无法读取最近审计记录。</p> : null}
      {!loading && dashboard?.recentAudits?.length === 0 ? <p className="mt-3 text-xs text-zinc-500">暂无最近审计记录。</p> : null}
      {!loading && dashboard?.recentAudits?.length ? (
        <div className="mt-3 divide-y divide-zinc-100 text-xs">
          {dashboard.recentAudits.map((audit) => (
            <div key={audit.id} className="py-2">
              <p className="font-medium text-zinc-900">{audit.action}</p>
              <p className="mt-0.5 text-zinc-500">{audit.resourceType} · {formatAuditTime(audit.createdAt)}{audit.actorName ? ` · ${audit.actorName}` : ""}</p>
            </div>
          ))}
        </div>
      ) : null}
      {!loading && !dashboard ? <p className="mt-3 text-xs text-zinc-500">暂时无法读取审计记录。</p> : null}
    </div>
  );
}

function LoginPanel({ error }: { error: string | null }) {
  const [email, setEmail] = useState(`admin${STAFF_EMAIL_DOMAIN}`);
  const [password, setPassword] = useState("Demo@123456");
  const [submitting, setSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setLoginError(null);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/",
    });

    if (result?.error) {
      setLoginError("账号或密码不正确，请重试。");
      setSubmitting(false);
      return;
    }

    window.location.assign("/");
  }

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5" aria-labelledby="login-title">
      <div className="max-w-md">
        <h2 id="login-title" className="text-base font-semibold">未登录状态</h2>
        <p className="mt-1 text-base font-semibold">登录后台</p>
        <p className="mt-1 text-sm text-zinc-500">使用员工账号进入会员工作台。</p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <label className="block text-sm font-medium text-zinc-700">
            邮箱
            <input className="mt-1 h-10 w-full rounded-md border-zinc-300" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            密码
            <input className="mt-1 h-10 w-full rounded-md border-zinc-300" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {loginError || error ? <p className="text-sm text-red-700">{loginError ?? error}</p> : null}
          <button className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50" type="submit" disabled={submitting}>
            {submitting ? "登录中..." : "登录"}
          </button>
        </form>
        <p className="mt-3 text-xs text-zinc-500">演示账号已预填：admin{STAFF_EMAIL_DOMAIN} / Demo@123456</p>
      </div>
    </section>
  );
}

function formatShellError(error: unknown) {
  if (error instanceof ApiError) {
    const message = withDatabaseHint(error.message);
    return error.requestId ? `${message}（请求 ${error.requestId}）` : message;
  }

  if (error instanceof Error) {
    return withDatabaseHint(error.message);
  }

  return "登录态读取失败";
}

function withDatabaseHint(message: string) {
  if (/fetch|Failed|Network|Prisma|database|ECONNREFUSED|P10\d{2}|接口未返回/i.test(message)) {
    return `${message}。如当前环境没有真实数据库，请配置数据库并运行 pnpm seed 后重试。`;
  }

  return message;
}

function formatDashboardError(error: unknown) {
  if (error instanceof ApiError) {
    return error.requestId ? `${error.message}（请求 ${error.requestId}）` : error.message;
  }

  return "请稍后刷新页面重试。";
}

function formatAuditTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : date.toLocaleString("zh-CN", { hour12: false });
}

function storeLabel(storeId?: string | null) {
  return storeId === "demo-store-shanghai" ? "上海人民广场演示店" : storeId || "未分配门店";
}
