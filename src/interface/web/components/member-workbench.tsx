"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

import {
  ApiError,
  AreaOption,
  CreateBlacklistInput,
  CreateMemberInput,
  CurrentEmployee,
  FollowUpRecord,
  MemberDetail,
  MemberListItem,
  MemberListQuery,
  MemberQuery,
  MemberQueryResultItem,
  MemberOwner,
  UpdateMemberInput,
  canUse,
  createFollowUp,
  createBlacklist,
  createMember,
  deleteMember,
  fetchAudits,
  fetchBlacklists,
  fetchMemberDetail,
  fetchMemberOwners,
  fetchAreas,
  fetchMembers,
  fetchStores,
  getMemberProfileFields,
  executeMemberQuery,
  parseMemberQuery,
  updateMember,
  unwrapItems,
} from "@/interface/shared/legacy-client/members";

const filters = {
  statuses: [
    ["LEAD", "线索"],
    ["ACTIVE", "服务中"],
    ["MATCHING", "牵线中"],
    ["PAUSED", "暂停"],
    ["MARRIED", "已成婚"],
    ["REFUNDED", "已退款"],
    ["BLACKLISTED", "黑名单"],
    ["ARCHIVED", "归档"],
  ],
  sortBy: [
    { value: "createdAt", label: "创建时间" },
    { value: "updatedAt", label: "更新时间" },
    { value: "memberNo", label: "会员编号" },
  ],
};

const statusLabels: Record<string, string> = {
  LEAD: "线索",
  ACTIVE: "服务中",
  MATCHING: "牵线中",
  PAUSED: "暂停",
  MARRIED: "已成婚",
  REFUNDED: "已退款",
  BLACKLISTED: "黑名单",
  ARCHIVED: "归档",
  PENDING_MATCH: "待匹配",
  ACTIVITY_REGISTERED: "活动报名",
  PENDING_PAYMENT: "待收费",
  CLOSED: "已关闭",
  RISK_REVIEW: "风险复核",
};

const genderLabels: Record<string, string> = {
  FEMALE: "女",
  MALE: "男",
  OTHER: "其他",
  UNKNOWN: "未知",
};

const initialQuery: Required<MemberListQuery> = {
  keyword: "",
  name: "",
  phone: "",
  memberNo: "",
  storeId: "",
  ownerId: "",
  status: "",
  sortBy: "createdAt",
  sortOrder: "desc",
  page: 1,
  pageSize: 20,
};

const initialForm: CreateMemberInput = {
  name: "",
  phone: "",
  gender: "UNKNOWN",
  education: "",
  maritalStatus: "",
};

const initialFollowup = {
  method: "PHONE",
  content: "",
  nextAction: "",
  nextFollowUpAt: "",
};

const initialBlacklist: Omit<CreateBlacklistInput, "memberId"> = {
  riskType: "CONTACT_DUPLICATE",
  reason: "",
};

type EditMemberInput = CreateMemberInput & { status?: string };

type MemberFormErrors = Partial<Record<"name" | "phone" | "birthDate" | "heightCm" | "weightKg", string>>;
type ColumnKey =
  | "name"
  | "phone"
  | "memberNo"
  | "store"
  | "owner"
  | "status"
  | "gender"
  | "profileCompleteness"
  | "education"
  | "heightCm"
  | "weightKg"
  | "maritalStatus"
  | "occupation"
  | "incomeRange"
  | "hometown"
  | "currentCity"
  | "updatedAt";

const mainlandMobilePattern = /^1[3-9]\d{9}$/;
const memberNamePattern = /^[\p{L}\p{M}·.' ]+$/u;
const educationOptions = ["初中及以下", "高中/中专", "大专", "本科", "硕士", "博士", "其他"];
const maritalStatusOptions = ["未婚", "离异", "丧偶", "未知"];
const incomeRangeOptions = ["保密", "10万以下", "10-20万", "20-30万", "30-50万", "50-100万", "100万以上"];
const statusRules = [
  "新增会员默认进入“线索”。",
  "登记有效黑名单会自动切到“黑名单”，并触发后续高风险动作拦截。",
  "其余状态目前由有权限的员工在详情里手动调整，后续匹配、收费、活动模块补齐后再接入自动流转。",
];
const tableColumns: { key: ColumnKey; label: string; defaultVisible: boolean; sortable?: Required<MemberListQuery>["sortBy"] }[] = [
  { key: "name", label: "会员", defaultVisible: true },
  { key: "phone", label: "手机号", defaultVisible: true },
  { key: "memberNo", label: "会员编号", defaultVisible: false, sortable: "memberNo" },
  { key: "store", label: "门店", defaultVisible: true },
  { key: "owner", label: "顾问", defaultVisible: true },
  { key: "status", label: "状态", defaultVisible: true },
  { key: "gender", label: "性别", defaultVisible: false },
  { key: "profileCompleteness", label: "画像", defaultVisible: true },
  { key: "education", label: "学历", defaultVisible: false },
  { key: "heightCm", label: "身高", defaultVisible: false },
  { key: "weightKg", label: "体重", defaultVisible: false },
  { key: "maritalStatus", label: "婚况", defaultVisible: false },
  { key: "occupation", label: "职业", defaultVisible: false },
  { key: "incomeRange", label: "收入", defaultVisible: false },
  { key: "hometown", label: "籍贯", defaultVisible: false },
  { key: "currentCity", label: "城市", defaultVisible: false },
  { key: "updatedAt", label: "更新时间", defaultVisible: true, sortable: "updatedAt" },
];
const defaultVisibleColumns = tableColumns.filter((column) => column.defaultVisible).map((column) => column.key);

export function MemberWorkbench({ employee }: { employee?: CurrentEmployee | null }) {
  const [draftQuery, setDraftQuery] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [members, setMembers] = useState<MemberListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState<CreateMemberInput>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [memberFormAttempted, setMemberFormAttempted] = useState(false);
  const [owners, setOwners] = useState<MemberOwner[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownersError, setOwnersError] = useState<string | null>(null);
  const [selectedMember, setSelectedMember] = useState<MemberListItem | null>(null);
  const [storeOptions, setStoreOptions] = useState<{ value: string; label: string }[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(defaultVisibleColumns);
  const [memberQuery, setMemberQuery] = useState<MemberQuery | null>(null);
  const [activeMemberQuery, setActiveMemberQuery] = useState<{ query: MemberQuery; page: number } | null>(null);
  const [quickFillText, setQuickFillText] = useState("");
  const [quickFillError, setQuickFillError] = useState<string | null>(null);
  const [quickFilling, setQuickFilling] = useState(false);

  const canRead = employee === undefined || canUse("member:read", employee);
  const canWrite = employee === undefined || canUse("member:write", employee);
  const canEditProfile = employee === undefined || (
    canUse("member:write", employee) && canUse("profile:write", employee)
  );
  const canFollowup = employee === undefined || canUse("followup:write", employee);
  const canBlacklist = employee === undefined || canUse("blacklist:write", employee);
  const canDelete = employee === undefined || canUse("member:delete", employee);
  const canChooseOwner = canWrite;
  const ownerOptions = useMemo(
    () => owners.map((owner) => ({ value: owner.employeeId, label: ownerLabel(owner) })),
    [owners],
  );
  const orderedVisibleColumns = useMemo(
    () => tableColumns.filter((column) => visibleColumns.includes(column.key)),
    [visibleColumns],
  );

  useEffect(() => {
    let ignore = false;

    async function loadStores() {
      try {
        const result = await fetchStores();
        if (!ignore) {
          setStoreOptions(result.items.map((store) => ({ value: store.id, label: store.name })));
        }
      } catch {
        if (!ignore && employee?.storeId) {
          setStoreOptions([{ value: employee.storeId, label: employee.storeName ?? employee.storeId }]);
        }
      }
    }

    loadStores();
    return () => {
      ignore = true;
    };
  }, [employee?.storeId, employee?.storeName]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadMembers() {
      if (!canRead) {
        setMembers([]);
        setTotal(0);
        setHasNext(false);
        setLoading(false);
        setError("当前员工缺少 member:read 权限，无法读取会员档案。");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const result = activeMemberQuery
          ? await executeMemberQuery(activeMemberQuery.query, activeMemberQuery.page)
          : await fetchMembers(query);
        let resultItems: MemberListItem[];
        if (activeMemberQuery) {
          resultItems = (result as Awaited<ReturnType<typeof executeMemberQuery>>).items
            .map((item) => searchResultToMember(item));
        } else {
          resultItems = (result as Awaited<ReturnType<typeof fetchMembers>>).items;
        }
        if (!controller.signal.aborted) {
          setMembers(resultItems);
          setTotal(result.total);
          setHasNext(result.hasNext);
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setMembers([]);
          setTotal(0);
          setHasNext(false);
          setError(formatError(loadError));
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadMembers();

    return () => controller.abort();
  }, [canRead, query, activeMemberQuery]);

  useEffect(() => {
    if (!canWrite) {
      return;
    }

    let ignore = false;
    setOwnersLoading(true);
    setOwnersError(null);

    fetchMemberOwners()
      .then((result) => {
        if (ignore) return;
        setOwners(result);
        setForm((current) => ({
          ...current,
          ownerEmployeeId: canChooseOwner
            ? current.ownerEmployeeId || employee?.employeeId || result[0]?.employeeId
            : employee?.employeeId || current.ownerEmployeeId || result[0]?.employeeId,
        }));
      })
      .catch((loadError) => {
        if (!ignore) {
          setOwners([]);
          setOwnersError(formatError(loadError));
        }
      })
      .finally(() => {
        if (!ignore) setOwnersLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [canWrite, canChooseOwner, employee?.employeeId]);

  function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberQuery) {
      setQuickFillError("请先输入自然语言并解析查询条件。");
      return;
    }
    if (memberQuery.unresolved.length > 0) {
      setQuickFillError("存在未解析条件，请先修正，或明确确认忽略后再查询。");
      return;
    }
    setActiveMemberQuery({ query: memberQuery, page: 1 });
  }

  function resetSearch() {
    setDraftQuery(initialQuery);
    setQuery(initialQuery);
    setMemberQuery(null);
    setActiveMemberQuery(null);
    setQuickFillText("");
    setQuickFillError(null);
  }

  async function quickFillSearchDraft() {
    setQuickFilling(true);
    setQuickFillError(null);
    try {
      setMemberQuery(await parseMemberQuery(quickFillText));
    } catch (quickFillError) {
      setQuickFillError(formatError(quickFillError));
    } finally {
      setQuickFilling(false);
    }
  }

  function toggleColumn(columnKey: ColumnKey) {
    setVisibleColumns((current) => {
      if (current.includes(columnKey)) {
        return current.filter((key) => key !== columnKey);
      }

      return [...current, columnKey];
    });
  }

  function toggleAllColumns() {
    setVisibleColumns((current) => (
      current.length === tableColumns.length
        ? []
        : tableColumns.map((column) => column.key)
    ));
  }

  function applyHeaderFilter(next: Partial<Required<MemberListQuery>>) {
    const merged = { ...draftQuery, ...next, page: 1 };
    setDraftQuery(merged);
    setQuery(merged);
    setActiveMemberQuery(null);
  }

  function sortByColumn(column: (typeof tableColumns)[number]) {
    if (!column.sortable) {
      return;
    }

    const nextSortOrder = draftQuery.sortBy === column.sortable && draftQuery.sortOrder === "desc" ? "asc" : "desc";
    applyHeaderFilter({ sortBy: column.sortable, sortOrder: nextSortOrder });
  }

  async function submitMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMemberFormAttempted(true);
    setSubmitting(true);
    setSubmitError(null);

    if (Object.keys(validateMemberForm(form)).length > 0) {
      setSubmitting(false);
      return;
    }

    try {
      await createMember(cleanMemberInput(form));
      setIsModalOpen(false);
      setForm(initialForm);
      setMemberFormAttempted(false);
      setQuery((current) => ({ ...current, page: 1 }));
    } catch (createError) {
      setSubmitError(formatError(createError));
    } finally {
      setSubmitting(false);
    }
  }

  if (selectedMember) {
    return (
      <MemberDetailDrawer
        canBlacklist={canBlacklist}
        canDelete={canDelete && canEditMember(employee, selectedMember)}
        canEdit={canEditProfile}
        canFollowup={canFollowup}
        member={selectedMember}
        onClose={() => setSelectedMember(null)}
        onFollowupCreated={() => setQuery((current) => ({ ...current }))}
        onMemberUpdated={(updated) => {
          setMembers((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
          setSelectedMember((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
        }}
        onMemberDeleted={(deletedId) => {
          setMembers((current) => current.filter((item) => item.id !== deletedId));
          setSelectedMember(null);
          setTotal((current) => Math.max(0, current - 1));
        }}
        ownerOptions={ownerOptions}
        storeOptions={storeOptions}
      />
    );
  }

  return (
    <div className="relative min-h-[calc(100vh-7rem)] overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-zinc-200 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">会员运营工作台</h2>
          <p className="mt-1 text-xs text-zinc-500">筛选、查看档案与跟进记录集中处理</p>
        </div>
        <div className="flex items-center gap-2">
          <details className="relative">
            <summary className="flex h-8 cursor-pointer list-none items-center rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
              词条显示
            </summary>
            <div className="absolute right-0 z-20 mt-2 grid w-72 grid-cols-2 gap-2 rounded-md border border-zinc-200 bg-white p-3 text-xs shadow-lg">
              <label className="col-span-2 flex items-center gap-2 border-b border-zinc-100 pb-2 font-medium text-zinc-900">
                <input checked={visibleColumns.length === tableColumns.length} type="checkbox" onChange={toggleAllColumns} />
                全选
              </label>
              {tableColumns.map((column) => (
                <label key={column.key} className="flex items-center gap-2 text-zinc-700">
                  <input checked={visibleColumns.includes(column.key)} type="checkbox" onChange={() => toggleColumn(column.key)} />
                  {column.label}
                </label>
              ))}
            </div>
          </details>
          <button
            className="h-8 rounded-md bg-zinc-950 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            type="button"
            disabled={!canWrite}
            onClick={() => {
              setSubmitError(null);
              setMemberFormAttempted(false);
              setForm({ ...initialForm, ownerEmployeeId: employee?.employeeId });
              setIsModalOpen(true);
            }}
          >
            新增会员
          </button>
        </div>
      </div>

      <form className="border-b border-zinc-200 bg-zinc-50/70 px-5 py-4" onSubmit={runSearch}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="sr-only" htmlFor="member-natural-query">会员自然语言查询</label>
            <input id="member-natural-query" className="h-10 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 text-sm" value={quickFillText} onChange={(event) => setQuickFillText(event.target.value)} placeholder="例如：杭州30岁左右175以上本科未婚女生" />
            <button className="h-10 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50" type="button" disabled={quickFilling || !quickFillText.trim()} onClick={() => void quickFillSearchDraft()}>{quickFilling ? "解析中..." : "解析条件"}</button>
          </div>
          {quickFillError ? <p className="text-xs text-amber-700">{quickFillError}</p> : null}
          {memberQuery ? (
            <div className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white px-3 py-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-zinc-700">
                <span className="font-medium">识别结果</span>
                <span className="rounded bg-zinc-100 px-2 py-1">{memberQuery.task === "find_member" ? "查找会员" : "条件搜索"}</span>
                {memberQueryChips(memberQuery).map((filter) => <span key={filter} className="rounded border border-zinc-200 px-2 py-1">{filter}</span>)}
              </div>
              {memberQuery.unresolved.length > 0 ? (
                <div className="flex flex-col gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900" role="alert">
                  <span>以下条件未被识别，不会参与查询；请修正条件，或明确确认忽略。</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {memberQuery.unresolved.map((item) => <span key={`${item.text}-${item.reason}`} className="rounded border border-amber-300 bg-white px-2 py-1">{item.text}：{item.reason}</span>)}
                    <button className="h-7 rounded-md border border-amber-400 bg-white px-2.5 font-medium hover:bg-amber-100" type="button" onClick={() => setMemberQuery((current) => current ? { ...current, unresolved: [] } : current)}>确认忽略未解析条件</button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : <p className="text-xs text-zinc-500">输入自然语言后解析为可见查询条件，再执行确定性查询。</p>}
          <div className="flex min-h-7 items-center gap-2 text-xs text-zinc-500">
            <button className="ml-auto h-8 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-100" type="button" onClick={resetSearch}>清空</button>
            <button className="h-8 rounded-md bg-zinc-950 px-4 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={!memberQuery || memberQuery.unresolved.length > 0}>执行查询</button>
          </div>
        </div>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-left text-xs" style={{ minWidth: `${Math.max(960, orderedVisibleColumns.length * 135 + 108)}px` }}>
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              {orderedVisibleColumns.map((column) => (
                <th key={column.key} className="border-b border-zinc-200 px-3 py-3 align-top font-medium">
                  <button className={column.sortable ? "font-medium text-zinc-700 hover:text-zinc-950" : "cursor-default font-medium"} type="button" onClick={() => sortByColumn(column)}>
                    {column.label}{draftQuery.sortBy === column.sortable ? (draftQuery.sortOrder === "desc" ? " ↓" : " ↑") : ""}
                  </button>
                  <HeaderFilter
                    columnKey={column.key}
                    draftQuery={draftQuery}
                    ownerOptions={ownerOptions}
                    storeOptions={storeOptions}
                    onFilter={applyHeaderFilter}
                  />
                </th>
              ))}
              <th className="w-[108px] border-b border-zinc-200 px-3 py-3 text-center align-top font-medium">详情</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <StateRow colSpan={orderedVisibleColumns.length + 1} text="正在读取会员档案..." />
            ) : error ? (
              <StateRow colSpan={orderedVisibleColumns.length + 1} text={error} actionLabel="重试" onAction={() => setQuery((current) => ({ ...current }))} />
            ) : members.length === 0 ? (
              <StateRow colSpan={orderedVisibleColumns.length + 1} text="暂无匹配会员，调整筛选或新增会员后再试。" />
            ) : (
              members.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  storeOptions={storeOptions}
                  visibleColumns={orderedVisibleColumns.map((column) => column.key)}
                  onOpen={() => setSelectedMember(member)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 border-t border-zinc-200 bg-zinc-50/50 px-5 py-3 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          第 {activeMemberQuery?.page ?? query.page} 页 · 共 {total} 条 · 每页 {query.pageSize} 条
        </span>
        <div className="flex items-center gap-2">
          <button
            className="h-7 rounded-md border border-zinc-300 px-2 font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            disabled={(activeMemberQuery?.page ?? query.page) <= 1 || loading}
            onClick={() => activeMemberQuery ? setActiveMemberQuery({ ...activeMemberQuery, page: Math.max(1, activeMemberQuery.page - 1) }) : setQuery((current) => ({ ...current, page: Math.max(1, current.page - 1) }))}
          >
            上一页
          </button>
          <button
            className="h-7 rounded-md border border-zinc-300 px-2 font-medium text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            type="button"
            disabled={!hasNext || loading}
            onClick={() => activeMemberQuery ? setActiveMemberQuery({ ...activeMemberQuery, page: activeMemberQuery.page + 1 }) : setQuery((current) => ({ ...current, page: current.page + 1 }))}
          >
            下一页
          </button>
        </div>
      </div>

      {isModalOpen ? (
        <CreateMemberDialog
          form={form}
          submitting={submitting}
          submitError={submitError}
          attemptedSubmit={memberFormAttempted}
          owners={owners}
          ownersLoading={ownersLoading}
          ownersError={ownersError}
          canChooseOwner={canChooseOwner}
          currentEmployeeId={employee?.employeeId}
          onChange={(nextForm) => {
            setSubmitError(null);
            setForm(nextForm);
          }}
          onClose={() => {
            setMemberFormAttempted(false);
            setIsModalOpen(false);
          }}
          onSubmit={submitMember}
        />
      ) : null}

    </div>
  );
}

function memberQueryChips(query: MemberQuery) {
  return query.filters.map((filter) => {
    const value = Array.isArray(filter.value) ? filter.value.join(" - ") : String(filter.value);
    if (filter.field === "gender") return `性别：${genderLabels[value] ?? value}`;
    if (filter.field === "age" && filter.op === "around") return `${value} 岁左右（${Number(value) - 2}~${Number(value) + 2} 岁）`;
    if (filter.field === "age" && filter.op === "lte") return `${value} 岁以下`;
    if (filter.field === "age" && filter.op === "gte") return `${value} 岁以上`;
    if (filter.op === "gte") return `${fieldLabel(filter.field)} ≥ ${value}`;
    if (filter.op === "lte") return `${fieldLabel(filter.field)} ≤ ${value}`;
    return `${fieldLabel(filter.field)}：${value}`;
  });
}

function fieldLabel(field: MemberQuery["filters"][number]["field"]) {
  return ({
    memberNo: "会员编号", name: "姓名", gender: "性别", birthDate: "出生日期", age: "年龄", status: "状态",
    heightCm: "身高", weightKg: "体重", education: "学历", occupation: "职业", incomeRange: "收入范围",
    maritalStatus: "婚姻状况", housingStatus: "住房情况", vehicleStatus: "车辆情况", hometownProvince: "籍贯省",
    hometownCity: "籍贯市", hometownDistrict: "籍贯区县", currentProvince: "现居省", currentCity: "现居市",
    currentDistrict: "现居区县", hometownLocation: "籍贯", currentLocation: "现居地", profileCompletenessPercent: "资料完整度",
    hobbies: "兴趣爱好", selfDescription: "自我描述", phone: "手机号", idCard: "身份证号",
  } satisfies Record<MemberQuery["filters"][number]["field"], string>)[field];
}

function searchResultToMember(result: MemberQueryResultItem): MemberListItem {
  return {
    id: result.id,
    name: result.name,
    phoneMasked: null,
    memberNo: result.memberNo,
    gender: result.gender ?? "UNKNOWN",
    status: result.status,
    profileCompletenessPercent: result.profileCompletenessPercent,
    heightCm: result.heightCm,
    weightKg: result.weightKg,
    maritalStatus: result.maritalStatus,
    occupation: result.occupation,
    education: result.education,
    currentProvince: result.currentLocation.province,
    currentCity: result.currentLocation.city,
    currentDistrict: result.currentLocation.district,
  };
}

function MemberRow({
  member,
  storeOptions,
  visibleColumns,
  onOpen,
}: {
  member: MemberListItem;
  storeOptions: { value: string; label: string }[];
  visibleColumns: ColumnKey[];
  onOpen: () => void;
}) {
  const completeness = member.profileCompletenessPercent ?? 0;

  return (
    <tr className="transition-colors hover:bg-emerald-50/45">
      {visibleColumns.map((column) => (
        <td key={column} className="max-w-[240px] truncate whitespace-nowrap border-b border-zinc-100 px-3 py-4 text-[13px] text-zinc-700" title={memberCellTitle(member, column, storeOptions)}>
          {renderMemberCell(member, column, storeOptions, completeness)}
        </td>
      ))}
      <td className="border-b border-zinc-100 px-3 py-4 text-center">
        <button
          className="h-8 whitespace-nowrap rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm hover:border-zinc-400 hover:bg-zinc-50"
          type="button"
          onClick={onOpen}
        >
          查看详情
        </button>
      </td>
    </tr>
  );
}

function renderMemberCell(member: MemberListItem, column: ColumnKey, storeOptions: { value: string; label: string }[], completeness: number) {
  switch (column) {
    case "name":
      return <span className="font-medium text-zinc-900">{member.name}</span>;
    case "phone":
      return member.phone ?? member.phoneMasked ?? "未登记号码";
    case "memberNo":
      return member.memberNo ?? "-";
    case "store":
      return member.storeName ?? labelOf(storeOptions, member.storeId) ?? member.storeId ?? "-";
    case "owner":
      return member.ownerName ?? member.consultantName ?? "未分配";
    case "status":
      return (
        <span className={member.status === "BLACKLISTED" ? "rounded bg-red-50 px-2 py-1 font-medium text-red-700" : "rounded bg-blue-50 px-2 py-1 font-medium text-blue-700"}>
          {statusLabels[member.status] ?? member.status}
        </span>
      );
    case "gender":
      return memberGenderLabel(member.gender);
    case "profileCompleteness":
      return (
        <>
          <div className="h-1.5 w-20 rounded bg-zinc-100">
            <div className="h-1.5 rounded bg-emerald-500" style={{ width: `${Math.min(100, Math.max(0, completeness))}%` }} />
          </div>
          <span className="mt-1 block text-zinc-500">{completeness}%</span>
        </>
      );
    case "education":
      return member.education ?? "-";
    case "heightCm":
      return member.heightCm ? `${member.heightCm} cm` : "-";
    case "weightKg":
      return member.weightKg ? `${member.weightKg} kg` : "-";
    case "maritalStatus":
      return member.maritalStatus ?? "-";
    case "occupation":
      return member.occupation ?? "-";
    case "incomeRange":
      return member.incomeRange ?? "-";
    case "hometown":
      return member.hometown ?? "-";
    case "currentCity":
      return member.currentCity ?? "-";
    case "updatedAt":
      return member.lastAction ?? formatDate(member.updatedAt);
  }
}

function memberCellTitle(member: MemberListItem, column: ColumnKey, storeOptions: { value: string; label: string }[]) {
  switch (column) {
    case "name":
      return member.name;
    case "phone":
      return member.phone ?? member.phoneMasked ?? "未登记号码";
    case "memberNo":
      return member.memberNo ?? "-";
    case "store":
      return member.storeName ?? labelOf(storeOptions, member.storeId) ?? member.storeId ?? "-";
    case "owner":
      return member.ownerName ?? member.consultantName ?? "未分配";
    case "status":
      return statusLabels[member.status] ?? member.status;
    case "gender":
      return memberGenderLabel(member.gender);
    case "profileCompleteness":
      return `${member.profileCompletenessPercent ?? 0}%`;
    case "education":
      return member.education ?? "-";
    case "heightCm":
      return member.heightCm ? `${member.heightCm} cm` : "-";
    case "weightKg":
      return member.weightKg ? `${member.weightKg} kg` : "-";
    case "maritalStatus":
      return member.maritalStatus ?? "-";
    case "occupation":
      return member.occupation ?? "-";
    case "incomeRange":
      return member.incomeRange ?? "-";
    case "hometown":
      return member.hometown ?? "-";
    case "currentCity":
      return member.currentCity ?? "-";
    case "updatedAt":
      return member.lastAction ?? formatDate(member.updatedAt);
  }
}

function MemberDetailDrawer({
  member,
  canBlacklist,
  canDelete,
  canEdit,
  canFollowup,
  onClose,
  onFollowupCreated,
  onMemberUpdated,
  onMemberDeleted,
  ownerOptions,
  storeOptions,
}: {
  member: MemberListItem;
  canBlacklist: boolean;
  canDelete: boolean;
  canEdit: boolean;
  canFollowup: boolean;
  onClose: () => void;
  onFollowupCreated: () => void;
  onMemberUpdated: (member: MemberDetail) => void;
  onMemberDeleted: (id: string) => void;
  ownerOptions: { value: string; label: string }[];
  storeOptions: { value: string; label: string }[];
}) {
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [followups, setFollowups] = useState<FollowUpRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followupForm, setFollowupForm] = useState(initialFollowup);
  const [followupError, setFollowupError] = useState<string | null>(null);
  const [savingFollowup, setSavingFollowup] = useState(false);
  const [blacklistForm, setBlacklistForm] = useState(initialBlacklist);
  const [blacklistError, setBlacklistError] = useState<string | null>(null);
  const [savingBlacklist, setSavingBlacklist] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditMemberInput>({ ...initialForm });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState("personal");
  const [editingPreference, setEditingPreference] = useState(false);
  const [savingPreference, setSavingPreference] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [preferenceForm, setPreferenceForm] = useState({ ageMin: "", ageMax: "", genderPreference: "OPPOSITE", educationRequirement: "", incomeMinAnnual: "", heightMinCm: "", heightMaxCm: "", maritalStatusRequirements: "未婚", hasHousing: "", hasVehicle: "", smokingPreference: "不限", drinkingPreference: "不限" });
  const [provinces, setProvinces] = useState<AreaOption[]>([]);
  const [hometownCities, setHometownCities] = useState<AreaOption[]>([]);
  const [hometownDistricts, setHometownDistricts] = useState<AreaOption[]>([]);
  const [currentCities, setCurrentCities] = useState<AreaOption[]>([]);
  const [currentDistricts, setCurrentDistricts] = useState<AreaOption[]>([]);

  useEffect(() => {
    let ignore = false;

    async function loadDetail() {
      setLoading(true);
      setError(null);

      try {
        const [detailResult, blacklistResult, auditResult] = await Promise.allSettled([
          fetchMemberDetail(member.id),
          fetchBlacklists(member.id),
          fetchAudits({ resourceType: "Member", resourceId: member.id }),
        ]);

        if (ignore) {
          return;
        }

        const nextDetail = detailResult.status === "fulfilled" ? detailResult.value : { ...member };
        if (detailResult.status === "rejected") {
          setError(`详情接口暂不可用：${formatError(detailResult.reason)}`);
        }

        setDetail({
          ...nextDetail,
          blacklistEntries: blacklistResult.status === "fulfilled" ? unwrapItems(blacklistResult.value) : nextDetail.blacklistEntries ?? [],
          auditLogs: auditResult.status === "fulfilled" ? unwrapItems(auditResult.value) : nextDetail.auditLogs ?? [],
        });
        setEditForm(memberToEditForm(nextDetail));
        setFollowups(nextDetail.followups ?? []);
        if (nextDetail.matePreferenceDetails) setPreferenceForm({ ageMin: String(nextDetail.matePreferenceDetails.ageMin ?? ""), ageMax: String(nextDetail.matePreferenceDetails.ageMax ?? ""), genderPreference: nextDetail.matePreferenceDetails.genderPreference, educationRequirement: nextDetail.matePreferenceDetails.educationRequirement ?? "", incomeMinAnnual: String(nextDetail.matePreferenceDetails.incomeMinAnnual ?? ""), heightMinCm: String(nextDetail.matePreferenceDetails.heightMinCm ?? ""), heightMaxCm: String(nextDetail.matePreferenceDetails.heightMaxCm ?? ""), maritalStatusRequirements: nextDetail.matePreferenceDetails.maritalStatusRequirements.join(","), hasHousing: nextDetail.matePreferenceDetails.hasHousing === null ? "" : String(nextDetail.matePreferenceDetails.hasHousing), hasVehicle: nextDetail.matePreferenceDetails.hasVehicle === null ? "" : String(nextDetail.matePreferenceDetails.hasVehicle), smokingPreference: nextDetail.matePreferenceDetails.smokingPreference ?? "不限", drinkingPreference: nextDetail.matePreferenceDetails.drinkingPreference ?? "不限" });
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    loadDetail();

    return () => {
      ignore = true;
    };
  }, [member]);

  useEffect(() => {
    fetchAreas(undefined, "PROVINCE").then(setProvinces).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (editForm.hometownProvince) fetchAreas(editForm.hometownProvince, "CITY").then(setHometownCities).catch(() => undefined);
    if (editForm.hometownCity) fetchAreas(editForm.hometownCity, "DISTRICT").then(setHometownDistricts).catch(() => undefined);
    if (editForm.currentProvince) fetchAreas(editForm.currentProvince, "CITY").then(setCurrentCities).catch(() => undefined);
    if (editForm.currentCity) fetchAreas(editForm.currentCity, "DISTRICT").then(setCurrentDistricts).catch(() => undefined);
  }, [editForm.hometownProvince, editForm.hometownCity, editForm.currentProvince, editForm.currentCity]);

  async function submitFollowup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingFollowup(true);
    setFollowupError(null);

    try {
      const created = await createFollowUp({
        memberId: member.id,
        method: followupForm.method,
        content: followupForm.content,
        nextAction: followupForm.nextAction || undefined,
        nextFollowUpAt: followupForm.nextFollowUpAt ? new Date(followupForm.nextFollowUpAt).toISOString() : undefined,
      });
      setFollowups((current) => [created, ...current]);
      setFollowupForm(initialFollowup);
      onFollowupCreated();
    } catch (createError) {
      setFollowupError(formatError(createError));
    } finally {
      setSavingFollowup(false);
    }
  }

  async function submitBlacklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingBlacklist(true);
    setBlacklistError(null);

    try {
      const created = await createBlacklist({
        memberId: member.id,
        riskType: blacklistForm.riskType,
        reason: blacklistForm.reason,
      });
      setDetail((currentDetail) => ({
        ...(currentDetail ?? { ...member }),
        blacklistEntries: [created, ...(currentDetail?.blacklistEntries ?? [])],
      }));
      setBlacklistForm(initialBlacklist);
    } catch (createError) {
      setBlacklistError(formatError(createError));
    } finally {
      setSavingBlacklist(false);
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingEdit(true);
    setEditError(null);

    try {
      const updated = await updateMember(member.id, cleanMemberInput(editForm));
      const nextDetail = {
        ...updated,
        blacklistEntries,
        auditLogs,
        followups,
      };
      setDetail(nextDetail);
      setEditForm(memberToEditForm(nextDetail));
      setEditing(false);
      onMemberUpdated(nextDetail);
    } catch (updateError) {
      setEditError(formatError(updateError));
    } finally {
      setSavingEdit(false);
    }
  }

  async function submitPreferenceEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPreference(true);
    setPreferenceError(null);

    try {
      const updated = await updateMember(member.id, {
        ageMin: preferenceForm.ageMin ? Number(preferenceForm.ageMin) : null,
        ageMax: preferenceForm.ageMax ? Number(preferenceForm.ageMax) : null,
        genderPreference: preferenceForm.genderPreference,
        educationRequirement: preferenceForm.educationRequirement || null,
        incomeMinAnnual: preferenceForm.incomeMinAnnual ? Number(preferenceForm.incomeMinAnnual) : null,
        heightMinCm: preferenceForm.heightMinCm ? Number(preferenceForm.heightMinCm) : null,
        heightMaxCm: preferenceForm.heightMaxCm ? Number(preferenceForm.heightMaxCm) : null,
        maritalStatusRequirements: preferenceForm.maritalStatusRequirements.split(",").map((value) => value.trim()).filter(Boolean),
        hasHousing: preferenceForm.hasHousing === "" ? null : preferenceForm.hasHousing === "true",
        hasVehicle: preferenceForm.hasVehicle === "" ? null : preferenceForm.hasVehicle === "true",
        smokingPreference: preferenceForm.smokingPreference || null,
        drinkingPreference: preferenceForm.drinkingPreference || null,
      });
      const nextDetail = { ...updated, blacklistEntries, auditLogs, followups };
      setDetail(nextDetail);
      setEditingPreference(false);
      onMemberUpdated(nextDetail);
    } catch (updateError) {
      setPreferenceError(formatError(updateError));
    } finally {
      setSavingPreference(false);
    }
  }

  async function removeMember() {
    if (!window.confirm(`确认删除会员「${current.name}」？删除后不可恢复。`)) {
      return;
    }

    setDeleting(true);
    setDeleteError(null);

    try {
      await deleteMember(member.id);
      onMemberDeleted(member.id);
    } catch (removeError) {
      setDeleteError(formatError(removeError));
    } finally {
      setDeleting(false);
    }
  }

  const current: MemberDetail = detail ?? { ...member };
  const profile = getMemberProfileFields(current);
  const blacklistEntries = detail?.blacklistEntries ?? [];
  const auditLogs = detail?.auditLogs ?? [];

  return (
    <section className="min-h-[calc(100vh-7rem)] overflow-hidden rounded-md border border-zinc-200 bg-white">
      <div className="flex min-h-[calc(100vh-7rem)] flex-col bg-white">
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-4 sm:px-5">
          <div>
            <h3 className="break-words text-base font-semibold">{current.name} · 会员详情</h3>
            <p className="mt-0.5 break-all text-xs text-zinc-500">{current.memberNo ?? current.id}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canDelete ? (
              <button
                className="h-8 rounded-md border border-red-200 px-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                type="button"
                disabled={deleting}
                onClick={removeMember}
              >
                {deleting ? "删除中" : "删除会员"}
              </button>
            ) : null}
            <button className="h-8 rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50" type="button" onClick={onClose}>
              返回会员列表
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-auto p-4 text-xs sm:p-5">
          {loading ? <InfoBox text="正在读取详情、黑名单与审计摘要..." /> : null}
          {error ? <InfoBox tone="warn" text={error} /> : null}
          {deleteError ? <InfoBox tone="warn" text={deleteError} /> : null}

          <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200 pb-px" aria-label="会员详情子界面">
            {[
              ["personal", "个人资料"],
              ["preference", "择偶要求"],
              ["description", "个人描述"],
              ["records", "业务记录"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setActiveDetailTab(value)}
                className={`whitespace-nowrap border-b-2 px-3 py-2 font-medium transition ${activeDetailTab === value ? "border-zinc-950 text-zinc-950" : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800"}`}
              >
                {label}
              </button>
            ))}
          </nav>

          {activeDetailTab === "personal" ? (
            <Panel title="个人资料" action={<button type="button" className="h-8 rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50" disabled={!canEdit} onClick={() => setEditing((value) => !value)}>{editing ? "取消编辑" : "编辑资料"}</button>}>
              {editing ? <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={submitEdit}>
                <TextField label="姓名" value={editForm.name} required onChange={(name) => setEditForm((value) => ({ ...value, name }))} />
                <SelectField label="性别" value={editForm.gender ?? "UNKNOWN"} options={[{ value: "MALE", label: "男" }, { value: "FEMALE", label: "女" }, { value: "OTHER", label: "其他" }, { value: "UNKNOWN", label: "未知" }]} onChange={(gender) => setEditForm((value) => ({ ...value, gender: gender as import("@/interface/shared/legacy-client/members").Gender }))} />
                <TextField label="出生日期" value={editForm.birthDate?.slice(0, 10) ?? ""} type="date" onChange={(birthDate) => setEditForm((value) => ({ ...value, birthDate: birthDate ? new Date(birthDate).toISOString() : undefined }))} />
                <SelectField label="状态" value={editForm.status ?? current.status} options={filters.statuses.map(([value, label]) => ({ value, label }))} onChange={(status) => setEditForm((value) => ({ ...value, status }))} />
                <SelectField label="学历" value={editForm.education ?? ""} options={[{ value: "", label: "请选择" }, ...educationOptions.map((value) => ({ value, label: value }))]} onChange={(education) => setEditForm((value) => ({ ...value, education: education || undefined }))} />
                <TextField label="职业" value={editForm.occupation ?? ""} onChange={(occupation) => setEditForm((value) => ({ ...value, occupation }))} />
                <SelectField label="收入范围" value={editForm.incomeRange ?? ""} options={[{ value: "", label: "请选择" }, ...incomeRangeOptions.map((value) => ({ value, label: value }))]} onChange={(incomeRange) => setEditForm((value) => ({ ...value, incomeRange: incomeRange || undefined }))} />
                <SelectField label="婚姻状况" value={editForm.maritalStatus ?? ""} options={[{ value: "", label: "请选择" }, ...maritalStatusOptions.map((value) => ({ value, label: value }))]} onChange={(maritalStatus) => setEditForm((value) => ({ ...value, maritalStatus: maritalStatus || undefined }))} />
                <TextField label="身高 cm" value={editForm.heightCm?.toString() ?? ""} type="number" onChange={(heightCm) => setEditForm((value) => ({ ...value, heightCm: heightCm ? Number(heightCm) : undefined }))} />
                <TextField label="体重 kg" value={editForm.weightKg?.toString() ?? ""} type="number" onChange={(weightKg) => setEditForm((value) => ({ ...value, weightKg: weightKg ? Number(weightKg) : undefined }))} />
                <TextField label="住房情况" value={editForm.housingStatus ?? ""} onChange={(housingStatus) => setEditForm((value) => ({ ...value, housingStatus }))} />
                <TextField label="车辆情况" value={editForm.vehicleStatus ?? ""} onChange={(vehicleStatus) => setEditForm((value) => ({ ...value, vehicleStatus }))} />
                <AreaCascade label="籍贯" province={editForm.hometownProvince} city={editForm.hometownCity} district={editForm.hometownDistrict} provinces={provinces} cities={hometownCities} districts={hometownDistricts} onChange={(area) => setEditForm((value) => ({ ...value, ...area }))} />
                <AreaCascade label="现居地区" province={editForm.currentProvince} city={editForm.currentCity} district={editForm.currentDistrict} provinces={provinces} cities={currentCities} districts={currentDistricts} onChange={(area) => setEditForm((value) => ({ ...value, ...area }))} />
                {editError ? <InfoBox tone="warn" text={editError} /> : null}
                <div className="flex justify-end gap-2 md:col-span-2"><button type="submit" className="h-8 rounded-md bg-zinc-950 px-3 text-xs font-medium text-white disabled:opacity-50" disabled={savingEdit}>{savingEdit ? "保存中" : "保存修改"}</button></div>
              </form> : <div className="grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
                <KeyValue label="会员编号" value={current.memberNo ?? current.id} /><KeyValue label="姓名" value={current.name ?? "-"} /><KeyValue label="性别" value={memberGenderLabel(current.gender)} /><KeyValue label="出生日期" value={current.birthDate?.slice(0, 10) ?? "-"} /><KeyValue label="状态" value={statusLabels[current.status] ?? current.status} /><KeyValue label="学历" value={profile.education ?? "-"} /><KeyValue label="职业" value={profile.occupation ?? "-"} /><KeyValue label="收入范围" value={profile.incomeRange ?? "-"} /><KeyValue label="婚姻状况" value={profile.maritalStatus ?? "-"} /><KeyValue label="身高" value={profile.heightCm ? `${profile.heightCm} cm` : "-"} /><KeyValue label="体重" value={profile.weightKg ? `${profile.weightKg} kg` : "-"} /><KeyValue label="住房情况" value={profile.housingStatus ?? "-"} /><KeyValue label="车辆情况" value={profile.vehicleStatus ?? "-"} /><KeyValue label="籍贯" value={areaDisplay(profile.hometownProvince, profile.hometownCity, profile.hometownDistrict, provinces, hometownCities, hometownDistricts)} /><KeyValue label="现居地" value={areaDisplay(profile.currentProvince, profile.currentCity, profile.currentDistrict, provinces, currentCities, currentDistricts)} /><KeyValue label="资料完整度" value={`${current.profileCompletenessPercent ?? 0}%`} /><KeyValue label="创建人ID" value={current.createdById ?? "-"} /><KeyValue label="最后修改人ID" value={current.updatedById ?? "-"} /><KeyValue label="创建时间" value={formatDate(current.createdAt)} /><KeyValue label="更新时间" value={formatDate(current.updatedAt)} />
              </div>}
            </Panel>
          ) : null}
          {activeDetailTab === "preference" ? (
            <Panel title="择偶要求" action={<button type="button" className="h-8 rounded-md border border-zinc-300 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50" disabled={!canEdit} onClick={() => { setPreferenceError(null); setEditingPreference((value) => !value); }}>{editingPreference ? "取消编辑" : "编辑资料"}</button>}>
              {!canEdit && !editingPreference ? <InfoBox tone="warn" text="当前账号没有编辑会员资料的权限。" /> : null}
              {editingPreference ? <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={submitPreferenceEdit}>
                <TextField label="最小年龄" value={preferenceForm.ageMin} type="number" onChange={(ageMin) => setPreferenceForm((value) => ({ ...value, ageMin }))} /><TextField label="最大年龄" value={preferenceForm.ageMax} type="number" onChange={(ageMax) => setPreferenceForm((value) => ({ ...value, ageMax }))} />
                <SelectField label="性别要求" value={preferenceForm.genderPreference} options={[{ value: "OPPOSITE", label: "异性" }, { value: "MALE", label: "男性" }, { value: "FEMALE", label: "女性" }, { value: "ANY", label: "不限" }]} onChange={(genderPreference) => setPreferenceForm((value) => ({ ...value, genderPreference }))} /><TextField label="学历要求" value={preferenceForm.educationRequirement} onChange={(educationRequirement) => setPreferenceForm((value) => ({ ...value, educationRequirement }))} />
                <TextField label="最低年收入（元）" value={preferenceForm.incomeMinAnnual} type="number" onChange={(incomeMinAnnual) => setPreferenceForm((value) => ({ ...value, incomeMinAnnual }))} /><TextField label="最低身高 cm" value={preferenceForm.heightMinCm} type="number" onChange={(heightMinCm) => setPreferenceForm((value) => ({ ...value, heightMinCm }))} /><TextField label="最高身高 cm" value={preferenceForm.heightMaxCm} type="number" onChange={(heightMaxCm) => setPreferenceForm((value) => ({ ...value, heightMaxCm }))} /><TextField label="婚姻状况（逗号分隔）" value={preferenceForm.maritalStatusRequirements} onChange={(maritalStatusRequirements) => setPreferenceForm((value) => ({ ...value, maritalStatusRequirements }))} />
                <SelectField label="住房要求" value={preferenceForm.hasHousing} options={[{ value: "", label: "不限" }, { value: "true", label: "需要有房" }, { value: "false", label: "无特殊要求" }]} onChange={(hasHousing) => setPreferenceForm((value) => ({ ...value, hasHousing }))} /><SelectField label="车辆要求" value={preferenceForm.hasVehicle} options={[{ value: "", label: "不限" }, { value: "true", label: "需要有车" }, { value: "false", label: "无特殊要求" }]} onChange={(hasVehicle) => setPreferenceForm((value) => ({ ...value, hasVehicle }))} />
                <TextField label="吸烟要求" value={preferenceForm.smokingPreference} onChange={(smokingPreference) => setPreferenceForm((value) => ({ ...value, smokingPreference }))} /><TextField label="饮酒要求" value={preferenceForm.drinkingPreference} onChange={(drinkingPreference) => setPreferenceForm((value) => ({ ...value, drinkingPreference }))} />
                {preferenceError ? <div className="md:col-span-2"><InfoBox tone="warn" text={preferenceError} /></div> : null}
                <div className="flex justify-end md:col-span-2"><button className="h-8 rounded-md bg-zinc-950 px-3 text-xs font-medium text-white disabled:opacity-50" type="submit" disabled={savingPreference}>{savingPreference ? "保存中" : "保存修改"}</button></div>
              </form> : null}
              {!editingPreference && current.matePreferenceDetails ? <>
                <KeyValue label="年龄范围" value={`${current.matePreferenceDetails.ageMin ?? "不限"} - ${current.matePreferenceDetails.ageMax ?? "不限"} 岁`} />
                <KeyValue label="性别要求" value={current.matePreferenceDetails.genderPreference} />
                <KeyValue label="学历要求" value={current.matePreferenceDetails.educationRequirement ?? "不限"} />
                <KeyValue label="最低年收入" value={current.matePreferenceDetails.incomeMinAnnual ? `${current.matePreferenceDetails.incomeMinAnnual / 10000}万` : "不限"} />
                <KeyValue label="身高范围" value={`${current.matePreferenceDetails.heightMinCm ?? "不限"} - ${current.matePreferenceDetails.heightMaxCm ?? "不限"} cm`} />
                <KeyValue label="婚姻状况" value={current.matePreferenceDetails.maritalStatusRequirements.join("、") || "不限"} />
                <KeyValue label="住房要求" value={current.matePreferenceDetails.hasHousing === null ? "不限" : current.matePreferenceDetails.hasHousing ? "有住房" : "无特殊要求"} />
                <KeyValue label="车辆要求" value={current.matePreferenceDetails.hasVehicle === null ? "不限" : current.matePreferenceDetails.hasVehicle ? "有车辆" : "无特殊要求"} />
                <KeyValue label="吸烟要求" value={current.matePreferenceDetails.smokingPreference ?? "不限"} />
                <KeyValue label="饮酒要求" value={current.matePreferenceDetails.drinkingPreference ?? "不限"} />
              </> : !editingPreference ? <InfoBox text="暂未填写择偶要求。" /> : null}
            </Panel>
          ) : null}
          {activeDetailTab === "description" ? (
            <Panel title="个人描述">
              <div className="space-y-4">
                <div>
                  <div className="mb-1 font-medium text-zinc-500">自我描述</div>
                  <p className="whitespace-pre-wrap leading-6 text-zinc-800">{profile.selfDescription ?? "暂未填写"}</p>
                </div>
                <div>
                  <div className="mb-1 font-medium text-zinc-500">兴趣爱好</div>
                  <p className="whitespace-pre-wrap leading-6 text-zinc-800">{profile.hobbies ?? "暂未填写"}</p>
                </div>
              </div>
            </Panel>
          ) : null}
          {activeDetailTab === "records" ? (
            <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Panel title="跟进记录">
                {followups.length > 0 ? (
                  <div className="space-y-3">
                    {followups.map((item) => <div key={item.id} className="border-b border-zinc-100 pb-3 last:border-0 last:pb-0"><div className="flex items-center justify-between gap-3"><span className="font-medium text-zinc-900">{item.method ?? "跟进"}</span><span className="shrink-0 text-zinc-500">{formatDate(item.createdAt)}</span></div><p className="mt-1 text-zinc-700">{item.content || "已记录跟进"}</p>{item.nextAction || item.nextFollowUpAt ? <p className="mt-1 text-zinc-500">下一步：{item.nextAction ?? "待回访"} · {formatDate(item.nextFollowUpAt)}</p> : null}</div>)}
                  </div>
                ) : <InfoBox text="暂无跟进记录。" />}
              </Panel>
              <Panel title="认证资料">
                {(detail?.documents ?? []).length > 0 ? <div className="space-y-2">{detail?.documents?.map((document) => <KeyValue key={document.id} label={document.type} value={`${document.status ?? "待审"} · ${formatDate(document.createdAt)}`} />)}</div> : <InfoBox text="暂无认证资料记录。" />}
              </Panel>
              <Panel title="黑名单记录">
                {blacklistEntries.length > 0 ? <div className="space-y-2">{blacklistEntries.map((entry) => <KeyValue key={entry.id} label={entry.riskType ?? entry.status} value={entry.reason} />)}</div> : <InfoBox text="未命中黑名单记录。" />}
              </Panel>
              <Panel title="操作审计">
                {auditLogs.length > 0 ? <div className="space-y-2">{auditLogs.map((log) => <KeyValue key={log.id} label={log.action} value={`${log.actorName ?? "系统"} · ${formatDate(log.createdAt)}`} />)}</div> : <InfoBox text="暂无相关操作记录。" />}
              </Panel>
            </section>
          ) : null}

          {activeDetailTab === "__legacy_disabled__" ? (
            <>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SummaryTile label="状态" value={statusLabels[current.status] ?? current.status} />
            <SummaryTile label="黑名单" value={blacklistEntries.length > 0 || current.status === "BLACKLISTED" ? "有风险记录" : "未命中"} danger={blacklistEntries.length > 0 || current.status === "BLACKLISTED"} />
            <SummaryTile label="画像完整度" value={`${profile.profileCompletenessPercent ?? 0}%`} />
            <SummaryTile label="最近更新" value={formatDate(current.updatedAt)} />
          </section>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Panel title="基础资料">
              <KeyValue label="会员编号" value={current.memberNo ?? current.id} />
              <KeyValue label="手机号" value={current.phone ?? current.phoneMasked ?? "未登记"} />
              <KeyValue label="身份证号" value={current.idCard ?? current.idCardMasked ?? "未登记"} />
              <KeyValue label="性别" value={memberGenderLabel(current.gender)} />
              <KeyValue label="出生日期" value={current.birthDate?.slice(0, 10) ?? "-"} />
              <KeyValue label="门店" value={current.storeName ?? labelOf(storeOptions, current.storeId) ?? current.storeId ?? "-"} />
              <KeyValue label="归属员工" value={current.ownerName ?? current.consultantName ?? "未分配"} />
            </Panel>

            <Panel title="会员画像">
              <KeyValue label="学历" value={profile.education ?? "-"} />
              <KeyValue label="身高" value={profile.heightCm ? `${profile.heightCm} cm` : "-"} />
              <KeyValue label="体重" value={profile.weightKg ? `${profile.weightKg} kg` : "-"} />
              <KeyValue label="婚况" value={profile.maritalStatus ?? "-"} />
              <KeyValue label="职业" value={profile.occupation ?? "-"} />
              <KeyValue label="收入" value={profile.incomeRange ?? "-"} />
              <KeyValue label="住房情况" value={profile.housingStatus ?? "-"} />
              <KeyValue label="车辆情况" value={profile.vehicleStatus ?? "-"} />
              <KeyValue label="籍贯" value={profile.hometown ?? "-"} />
              <KeyValue label="所在城市" value={profile.currentCity ?? "-"} />
              <KeyValue label="自我介绍" value={profile.selfDescription ?? "-"} />
            </Panel>
          </section>

          <Panel title="状态规则">
            <ul className="space-y-1 text-zinc-600">
              {statusRules.map((rule) => <li key={rule}>{rule}</li>)}
            </ul>
          </Panel>

          <Panel
            title="编辑会员资料"
            action={(
              <button className="h-7 rounded-md border border-zinc-300 px-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={!canEdit} onClick={() => setEditing((currentEditing) => !currentEditing)}>
                {editing ? "收起" : "编辑"}
              </button>
            )}
          >
            {!canEdit ? (
              <InfoBox tone="warn" text="当前账号可查看该会员，但没有权限编辑该会员资料。" />
            ) : editing ? (
              <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={submitEdit}>
                <TextField label="姓名" value={editForm.name} required onChange={(name) => setEditForm((currentForm) => ({ ...currentForm, name }))} />
                <TextField label="出生日期" value={editForm.birthDate?.slice(0, 10) ?? ""} type="date" min={getBirthDateBounds().min} max={getBirthDateBounds().max} onChange={(birthDate) => setEditForm((currentForm) => ({ ...currentForm, birthDate: birthDate ? new Date(birthDate).toISOString() : undefined }))} />
                {current.canEditIdentity ? (
                  <TextField label="手机号" value={editForm.phone ?? ""} inputMode="numeric" maxLength={11} onChange={(phone) => setEditForm((currentForm) => ({ ...currentForm, phone: phone.replace(/\D/g, "") }))} />
                ) : null}
                <SelectField
                  label="状态"
                  value={editForm.status ?? current.status}
                  options={filters.statuses.map(([value, label]) => ({ value, label }))}
                  onChange={(status) => setEditForm((currentForm) => ({ ...currentForm, status }))}
                />
                <SelectField
                  label="归属员工"
                  value={editForm.ownerEmployeeId ?? ""}
                  options={ownerOptions}
                  onChange={(ownerEmployeeId) => setEditForm((currentForm) => ({ ...currentForm, ownerEmployeeId }))}
                />
                <SelectField
                  label="门店"
                  value={editForm.storeId ?? current.storeId ?? ""}
                  options={storeOptions}
                  disabled
                  onChange={(storeId) => setEditForm((currentForm) => ({ ...currentForm, storeId }))}
                />
                <SelectField label="学历" value={editForm.education ?? ""} options={[{ value: "", label: "请选择" }, ...educationOptions.map((value) => ({ value, label: value }))]} onChange={(education) => setEditForm((currentForm) => ({ ...currentForm, education: education || undefined }))} />
                <TextField label="身高 cm" value={editForm.heightCm?.toString() ?? ""} type="number" min={120} max={230} step={1} onChange={(heightCm) => setEditForm((currentForm) => ({ ...currentForm, heightCm: heightCm ? Number(heightCm) : undefined }))} />
                <TextField label="体重 kg" value={editForm.weightKg?.toString() ?? ""} type="number" min={30} max={200} step={1} onChange={(weightKg) => setEditForm((currentForm) => ({ ...currentForm, weightKg: weightKg ? Number(weightKg) : undefined }))} />
                <SelectField label="婚况" value={editForm.maritalStatus ?? ""} options={[{ value: "", label: "请选择" }, ...maritalStatusOptions.map((value) => ({ value, label: value }))]} onChange={(maritalStatus) => setEditForm((currentForm) => ({ ...currentForm, maritalStatus: maritalStatus || undefined }))} />
                <TextField label="职业" value={editForm.occupation ?? ""} maxLength={40} onChange={(occupation) => setEditForm((currentForm) => ({ ...currentForm, occupation }))} />
                <SelectField label="收入范围" value={editForm.incomeRange ?? ""} options={[{ value: "", label: "请选择" }, ...incomeRangeOptions.map((value) => ({ value, label: value }))]} onChange={(incomeRange) => setEditForm((currentForm) => ({ ...currentForm, incomeRange: incomeRange || undefined }))} />
                <TextField label="住房情况" value={editForm.housingStatus ?? ""} maxLength={40} onChange={(housingStatus) => setEditForm((currentForm) => ({ ...currentForm, housingStatus }))} />
                <TextField label="车辆情况" value={editForm.vehicleStatus ?? ""} maxLength={40} onChange={(vehicleStatus) => setEditForm((currentForm) => ({ ...currentForm, vehicleStatus }))} />
                <AreaCascade label="籍贯" province={editForm.hometownProvince} city={editForm.hometownCity} district={editForm.hometownDistrict} provinces={provinces} cities={hometownCities} districts={hometownDistricts} onChange={(area) => setEditForm((currentForm) => ({ ...currentForm, ...area }))} />
                <AreaCascade label="现居地区" province={editForm.currentProvince} city={editForm.currentCity} district={editForm.currentDistrict} provinces={provinces} cities={currentCities} districts={currentDistricts} onChange={(area) => setEditForm((currentForm) => ({ ...currentForm, ...area }))} />
                <div className="md:col-span-2">
                  <TextAreaField label="自我介绍" value={editForm.selfDescription ?? ""} maxLength={500} onChange={(selfDescription) => setEditForm((currentForm) => ({ ...currentForm, selfDescription }))} />
                </div>
                {editError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 md:col-span-2">{editError}</div> : null}
                <div className="flex justify-end gap-2 md:col-span-2">
                  <button className="h-8 rounded-md border border-zinc-300 px-3 font-medium text-zinc-700 hover:bg-zinc-50" type="button" onClick={() => setEditing(false)}>
                    取消
                  </button>
                  <button className="h-8 rounded-md bg-zinc-950 px-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={savingEdit}>
                    {savingEdit ? "保存中" : "保存修改"}
                  </button>
                </div>
              </form>
            ) : (
              <InfoBox text="可修改基础资料、画像字段、会员状态和归属员工；保存后会写入审计。" />
            )}
          </Panel>

          <Panel title="新增跟进">
            <form className="grid grid-cols-1 gap-2 md:grid-cols-[120px_minmax(160px,1fr)_150px_80px]" onSubmit={submitFollowup}>
              <SelectField
                label="方式"
                value={followupForm.method}
                options={[
                  { value: "PHONE", label: "电话" },
                  { value: "WECHAT", label: "微信" },
                  { value: "VISIT", label: "到店" },
                  { value: "SYSTEM", label: "系统" },
                ]}
                onChange={(method) => setFollowupForm((currentForm) => ({ ...currentForm, method }))}
              />
              <TextField label="内容" value={followupForm.content} required onChange={(content) => setFollowupForm((currentForm) => ({ ...currentForm, content }))} />
              <TextField label="下次回访" value={followupForm.nextFollowUpAt} type="datetime-local" onChange={(nextFollowUpAt) => setFollowupForm((currentForm) => ({ ...currentForm, nextFollowUpAt }))} />
              <button className="h-9 rounded-md bg-zinc-950 px-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 md:mt-5" type="submit" disabled={!canFollowup || savingFollowup}>
                {savingFollowup ? "保存中" : "保存"}
              </button>
            </form>
            <TextField label="下一步动作" value={followupForm.nextAction} onChange={(nextAction) => setFollowupForm((currentForm) => ({ ...currentForm, nextAction }))} />
            {followupError ? <InfoBox tone="warn" text={followupError} /> : null}
            {!canFollowup ? <InfoBox tone="warn" text="当前员工缺少 followup:write 权限，无法新增跟进。" /> : null}
          </Panel>

          <Panel title="跟进列表">
            {followups.length > 0 ? (
              <div className="space-y-2">
                {followups.map((item) => (
                  <div key={item.id} className="border-b border-zinc-100 pb-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-zinc-900">{item.method ?? "跟进"}</span>
                      <span className="text-zinc-500">{formatDate(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-zinc-700">{item.content}</p>
                    {item.nextAction || item.nextFollowUpAt ? <p className="mt-1 text-zinc-500">下一步：{item.nextAction ?? "待回访"} · {formatDate(item.nextFollowUpAt)}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <InfoBox text="暂无跟进记录，可先新增本次沟通内容。" />
            )}
          </Panel>

          <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Panel title="资料元数据">
              {(detail?.documents ?? []).length > 0 ? (
                detail?.documents?.map((document) => <KeyValue key={document.id} label={document.type} value={`${document.fileName} · ${document.status ?? "待审"}`} />)
              ) : (
                <InfoBox text="暂无资料记录。登记证件、照片或承诺书后会在这里展示。" />
              )}
            </Panel>
            <Panel title="黑名单状态">
              {blacklistEntries.length > 0 ? (
                blacklistEntries.map((entry) => <KeyValue key={entry.id} label={entry.riskType ?? entry.status} value={entry.reason} />)
              ) : (
                <InfoBox text="未查询到黑名单命中记录，可在下方登记人工风险。" />
              )}
            </Panel>
            <Panel title="审计摘要">
              {auditLogs.length > 0 ? (
                auditLogs.slice(0, 5).map((log) => <KeyValue key={log.id} label={log.action} value={formatDate(log.createdAt)} />)
              ) : (
                <InfoBox text="暂无审计摘要；关键动作完成后会在这里留痕。" />
              )}
            </Panel>
          </section>

          <Panel title="登记黑名单">
            <form className="grid grid-cols-1 gap-2 md:grid-cols-[150px_minmax(160px,1fr)_88px]" onSubmit={submitBlacklist}>
              <SelectField
                label="风险类型"
                value={blacklistForm.riskType}
                options={[
                  { value: "CONTACT_DUPLICATE", label: "联系方式重复" },
                  { value: "DOCUMENT_DUPLICATE", label: "证件重复" },
                  { value: "COMPLAINT", label: "投诉纠纷" },
                  { value: "MANUAL_REVIEW", label: "人工复核" },
                ]}
                onChange={(riskType) => setBlacklistForm((currentForm) => ({ ...currentForm, riskType }))}
              />
              <TextField label="原因" value={blacklistForm.reason} required onChange={(reason) => setBlacklistForm((currentForm) => ({ ...currentForm, reason }))} />
              <button className="h-9 rounded-md bg-red-700 px-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 md:mt-5" type="submit" disabled={!canBlacklist || savingBlacklist}>
                {savingBlacklist ? "登记中" : "登记"}
              </button>
            </form>
            {blacklistError ? <InfoBox tone="warn" text={blacklistError} /> : null}
            {!canBlacklist ? <InfoBox tone="warn" text="当前员工缺少 blacklist:write 权限，无法登记黑名单。" /> : null}
          </Panel>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function CreateMemberDialog({
  form,
  submitting,
  submitError,
  attemptedSubmit,
  owners,
  ownersLoading,
  ownersError,
  canChooseOwner,
  currentEmployeeId,
  onChange,
  onClose,
  onSubmit,
}: {
  form: CreateMemberInput;
  submitting: boolean;
  submitError: string | null;
  attemptedSubmit: boolean;
  owners: MemberOwner[];
  ownersLoading: boolean;
  ownersError: string | null;
  canChooseOwner: boolean;
  currentEmployeeId?: string;
  onChange: (value: CreateMemberInput) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const errors = validateMemberForm(form);
  const birthDateBounds = getBirthDateBounds();
  const selectedOwner = owners.find((owner) => owner.employeeId === (form.ownerEmployeeId || currentEmployeeId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-6" role="dialog" aria-modal="true" aria-labelledby="create-member-title">
      <div className="max-h-[calc(100vh-3rem)] w-full max-w-2xl overflow-auto rounded-md bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold" id="create-member-title">新增会员档案</h3>
            <p className="mt-0.5 text-xs text-zinc-500">保存后刷新会员列表</p>
          </div>
          <button className="h-8 w-8 rounded-md border border-zinc-300 text-sm hover:bg-zinc-50" type="button" onClick={onClose}>
            ×
          </button>
        </div>
        <form className="space-y-4 p-5" noValidate onSubmit={onSubmit}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField
              label="姓名"
              value={form.name}
              required
              minLength={2}
              maxLength={30}
              hint="必填，2 至 30 个字符；仅支持文字、空格和 ·.'"
              error={attemptedSubmit ? errors.name : undefined}
              onChange={(name) => onChange({ ...form, name })}
            />
            <TextField
              label="手机号"
              value={form.phone ?? ""}
              inputMode="numeric"
              maxLength={11}
              hint="选填；填写时须为 11 位大陆手机号"
              error={errors.phone}
              onChange={(phone) => onChange({ ...form, phone: phone.replace(/\D/g, "") })}
            />
            <SelectField
              label="性别"
              value={form.gender}
              options={[
                { value: "UNKNOWN", label: "未知" },
                { value: "FEMALE", label: "女" },
                { value: "MALE", label: "男" },
                { value: "OTHER", label: "其他" },
              ]}
              onChange={(gender) => onChange({ ...form, gender: gender as CreateMemberInput["gender"] })}
            />
            <TextField
              label="出生日期"
              value={form.birthDate?.slice(0, 10) ?? ""}
              type="date"
              min={birthDateBounds.min}
              max={birthDateBounds.max}
              hint="选填，年龄须在 18 至 80 周岁"
              error={errors.birthDate}
              onChange={(birthDate) => onChange({ ...form, birthDate: birthDate ? new Date(birthDate).toISOString() : undefined })}
            />
            <div className="sm:col-span-2">
              {canChooseOwner ? (
                <SelectField
                  label="归属员工"
                  required
                  value={form.ownerEmployeeId ?? ""}
                  options={owners.map((owner) => ({ value: owner.employeeId, label: ownerLabel(owner) }))}
                  onChange={(ownerEmployeeId) => onChange({ ...form, ownerEmployeeId })}
                />
              ) : (
                <div>
                  <label className="block text-sm font-medium text-zinc-700" htmlFor="locked-owner">
                    归属员工
                    <RequiredMark />
                  </label>
                  <input
                    id="locked-owner"
                    className="mt-1 h-9 w-full rounded-md border border-zinc-200 bg-zinc-100 px-3 text-sm text-zinc-700"
                    value={selectedOwner ? ownerLabel(selectedOwner) : "当前员工"}
                    readOnly
                  />
                  <p className="mt-1 text-xs text-zinc-500">具备会员编辑权限的员工可选择归属员工。</p>
                </div>
              )}
              {ownersLoading ? <p className="mt-1 text-xs text-zinc-500">正在读取可归属员工...</p> : null}
              {ownersError ? <p className="mt-1 text-xs text-red-600">归属员工加载失败：{ownersError}</p> : null}
              {!ownersLoading && !ownersError && owners.length === 0 ? <p className="mt-1 text-xs text-amber-700">当前门店暂无可归属员工，暂不能保存会员。</p> : null}
            </div>
            <SelectField label="学历" value={form.education ?? ""} options={[{ value: "", label: "请选择" }, ...educationOptions.map((value) => ({ value, label: value }))]} onChange={(education) => onChange({ ...form, education: education || undefined })} />
            <TextField
              label="身高 cm"
              value={form.heightCm?.toString() ?? ""}
              type="number"
              min={120}
              max={230}
              step={1}
              hint="选填，120 至 230 厘米的整数"
              error={errors.heightCm}
              onChange={(heightCm) => onChange({ ...form, heightCm: heightCm ? Number(heightCm) : undefined })}
            />
            <TextField
              label="体重 kg"
              value={form.weightKg?.toString() ?? ""}
              type="number"
              min={30}
              max={200}
              step={1}
              hint="选填，30 至 200 千克的整数"
              error={errors.weightKg}
              onChange={(weightKg) => onChange({ ...form, weightKg: weightKg ? Number(weightKg) : undefined })}
            />
            <SelectField label="婚况" value={form.maritalStatus ?? ""} options={[{ value: "", label: "请选择" }, ...maritalStatusOptions.map((value) => ({ value, label: value }))]} onChange={(maritalStatus) => onChange({ ...form, maritalStatus: maritalStatus || undefined })} />
            <TextField label="职业" value={form.occupation ?? ""} maxLength={40} onChange={(occupation) => onChange({ ...form, occupation })} />
            <SelectField label="收入范围" value={form.incomeRange ?? ""} options={[{ value: "", label: "请选择" }, ...incomeRangeOptions.map((value) => ({ value, label: value }))]} onChange={(incomeRange) => onChange({ ...form, incomeRange: incomeRange || undefined })} />
            <TextField label="住房情况" value={form.housingStatus ?? ""} maxLength={40} onChange={(housingStatus) => onChange({ ...form, housingStatus })} />
            <TextField label="车辆情况" value={form.vehicleStatus ?? ""} maxLength={40} onChange={(vehicleStatus) => onChange({ ...form, vehicleStatus })} />
            <div className="sm:col-span-2">
              <TextAreaField label="自我介绍" value={form.selfDescription ?? ""} maxLength={500} onChange={(selfDescription) => onChange({ ...form, selfDescription })} />
            </div>
          </div>
          {submitError ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{submitError}</div> : null}
          <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
            <button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50" type="button" onClick={onClose}>
              取消
            </button>
            <button className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={submitting || ownersLoading || Boolean(ownersError) || owners.length === 0}>
              {submitting ? "提交中..." : "保存会员"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StateRow({ text, colSpan, actionLabel, onAction }: { text: string; colSpan: number; actionLabel?: string; onAction?: () => void }) {
  return (
    <tr>
      <td className="border-b border-zinc-100 px-3 py-10 text-center text-zinc-500" colSpan={colSpan}>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <span className="max-w-xl break-words">{text}</span>
          {actionLabel && onAction ? (
            <button className="h-7 rounded-md border border-zinc-300 px-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50" type="button" onClick={onAction}>
              {actionLabel}
            </button>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function HeaderFilter({
  columnKey,
  draftQuery,
  ownerOptions,
  storeOptions,
  onFilter,
}: {
  columnKey: ColumnKey;
  draftQuery: Required<MemberListQuery>;
  ownerOptions: { value: string; label: string }[];
  storeOptions: { value: string; label: string }[];
  onFilter: (next: Partial<Required<MemberListQuery>>) => void;
}) {
  if (columnKey === "name") {
    return (
      <input
        className="mt-1 h-7 w-full rounded-md border-zinc-300 px-2 text-[11px] font-normal leading-none"
        placeholder="筛选"
        value={draftQuery.name}
        onChange={(event) => onFilter({ name: event.target.value })}
      />
    );
  }

  if (columnKey === "phone") {
    return (
      <input
        className="mt-1 h-7 w-full rounded-md border-zinc-300 px-2 text-[11px] font-normal leading-none"
        inputMode="numeric"
        placeholder="筛选"
        value={draftQuery.phone}
        onChange={(event) => onFilter({ phone: event.target.value.replace(/\D/g, "") })}
      />
    );
  }

  if (columnKey === "memberNo") {
    return (
      <input
        className="mt-1 h-7 w-full rounded-md border-zinc-300 px-2 text-[11px] font-normal leading-none"
        placeholder="筛选"
        value={draftQuery.memberNo}
        onChange={(event) => onFilter({ memberNo: event.target.value })}
      />
    );
  }

  if (columnKey === "store") {
    return (
      <select className="mt-1 h-7 w-full rounded-md border-zinc-300 bg-white px-1.5 text-[11px] font-normal leading-none" value={draftQuery.storeId} onChange={(event) => onFilter({ storeId: event.target.value })}>
        <option value="">全部</option>
        {storeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  if (columnKey === "owner") {
    return (
      <select className="mt-1 h-7 w-full rounded-md border-zinc-300 bg-white px-1.5 text-[11px] font-normal leading-none" value={draftQuery.ownerId} onChange={(event) => onFilter({ ownerId: event.target.value })}>
        <option value="">全部</option>
        {ownerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  }

  if (columnKey === "status") {
    return (
      <select className="mt-1 h-7 w-full rounded-md border-zinc-300 bg-white px-1.5 text-[11px] font-normal leading-none" value={draftQuery.status} onChange={(event) => onFilter({ status: event.target.value })}>
        <option value="">全部</option>
        {filters.statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    );
  }

  return <span className="mt-1 block h-7 text-[11px] font-normal text-zinc-400">{columnKey === "updatedAt" ? "排序" : ""}</span>;
}

function memberGenderLabel(gender?: string | null) {
  if (!gender) {
    return "未知";
  }

  const normalized = gender.toUpperCase();
  return genderLabels[normalized] ?? (
    gender === "男" || gender === "女" || gender === "其他" || gender === "未知"
      ? gender
      : "未知"
  );
}

function canEditMember(employee: CurrentEmployee | null | undefined, member: Pick<MemberListItem, "storeId" | "ownerEmployeeId">) {
  if (employee === undefined) {
    return true;
  }

  if (!employee || !canUse("member:write", employee)) {
    return false;
  }

  void member;
  return true;
}

function ownerLabel(owner: MemberOwner) {
  return owner.roleName ? `${owner.name}（${owner.roleName}）` : owner.name;
}

function TextField({
  label,
  value,
  type = "text",
  required = false,
  minLength,
  min,
  max,
  maxLength,
  step,
  inputMode,
  hint,
  error,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  required?: boolean;
  minLength?: number;
  min?: string | number;
  max?: string | number;
  maxLength?: number;
  step?: number;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
  hint?: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-zinc-700">
      {label}
      {required ? <RequiredMark /> : null}
      <input
        aria-describedby={hint || error ? `${label}-help` : undefined}
        aria-invalid={Boolean(error)}
        className={error ? "mt-1 h-10 w-full rounded-md border-red-400 px-3 text-sm leading-none" : "mt-1 h-10 w-full rounded-md border-zinc-300 px-3 text-sm leading-none"}
        min={min}
        max={max}
        minLength={minLength}
        maxLength={maxLength}
        step={step}
        inputMode={inputMode}
        required={required}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <span id={`${label}-help`} className="mt-1 block text-xs font-normal text-red-600">{error}</span> : hint ? <span id={`${label}-help`} className="mt-1 block text-xs font-normal text-zinc-500">{hint}</span> : null}
    </label>
  );
}

function TextAreaField({
  label,
  value,
  maxLength,
  required = false,
  hint,
  onChange,
}: {
  label: string;
  value: string;
  maxLength?: number;
  required?: boolean;
  hint?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-zinc-700">
      {label}
      {required ? <RequiredMark /> : null}
      <textarea
        className="mt-1 min-h-20 w-full resize-y rounded-md border-zinc-300 px-3 py-2 text-sm"
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <span className="mt-1 block text-xs font-normal text-zinc-500">{hint}</span> : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  required = false,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  options: string[] | { value: string; label: string }[];
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-xs font-medium text-zinc-700">
      {label}
      {required ? <RequiredMark /> : null}
      <select required={required} disabled={disabled} className="mt-1 h-10 w-full rounded-md border-zinc-300 bg-white px-3 text-sm leading-none disabled:bg-zinc-100 disabled:text-zinc-500" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const normalized = typeof option === "string" ? { value: option, label: option } : option;
          return (
            <option key={normalized.value} value={normalized.value}>
              {normalized.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function RequiredMark() {
  return <span aria-hidden="true" className="ml-0.5 text-red-600">*</span>;
}

function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-md border border-zinc-200 p-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold text-zinc-900">{title}</h4>
        {action}
      </div>
      <div className="mt-3 space-y-2">{children}</div>
    </section>
  );
}

function SummaryTile({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={danger ? "rounded-md border border-red-200 bg-red-50 p-3" : "rounded-md border border-zinc-200 bg-zinc-50 p-3"}>
      <p className={danger ? "text-red-600" : "text-zinc-500"}>{label}</p>
      <p className={danger ? "mt-2 font-semibold text-red-700" : "mt-2 font-semibold text-zinc-900"}>{value}</p>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-3 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="min-w-0 break-words font-medium text-zinc-800">{value}</span>
    </div>
  );
}

function areaDisplay(province: string | null | undefined, city: string | null | undefined, district: string | null | undefined, provinces: AreaOption[], cities: AreaOption[], districts: AreaOption[]) {
  const names = [province && provinces.find((item) => item.code === province)?.name, city && cities.find((item) => item.code === city)?.name, district && districts.find((item) => item.code === district)?.name].filter(Boolean);
  return names.length > 0 ? names.join(" - ") : "-";
}

function InfoBox({ text, tone = "neutral" }: { text: string; tone?: "neutral" | "warn" }) {
  return <div className={tone === "warn" ? "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700" : "rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-500"}>{text}</div>;
}

function AreaCascade({ label, province, city, district, provinces, cities, districts, onChange }: { label: string; province?: string; city?: string; district?: string; provinces: AreaOption[]; cities: AreaOption[]; districts: AreaOption[]; onChange: (value: Record<string, string | undefined>) => void }) {
  const prefix = label === "籍贯" ? "hometown" : "current";
  const select = (value: string | undefined, options: AreaOption[], placeholder: string, key: string, disabled = false) => (
    <select className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 text-xs text-zinc-800" value={value ?? ""} disabled={disabled} onChange={(event) => onChange({ [`${prefix}${key[0].toUpperCase()}${key.slice(1)}`]: event.target.value || undefined, ...(key === "province" ? { [`${prefix}City`]: undefined, [`${prefix}District`]: undefined } : key === "city" ? { [`${prefix}District`]: undefined } : {}) })}>
      <option value="">{placeholder}</option>{options.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
    </select>
  );
  return <div className="md:col-span-2"><label className="mb-1 block text-xs font-medium text-zinc-600">{label}</label><div className="flex gap-2">{select(province, provinces, "省", "province")}{select(city, cities, "市", "city", !province)}{select(district, districts, "区/县", "district", !city)}</div></div>;
}

function cleanMemberInput<T extends CreateMemberInput | UpdateMemberInput>(input: T): T {
  const cleaned = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== "" && value !== undefined),
  ) as Record<string, unknown>;
  if (typeof cleaned.birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cleaned.birthDate)) {
    cleaned.birthDate = new Date(`${cleaned.birthDate}T00:00:00.000Z`).toISOString();
  }
  return cleaned as T;
}

function memberToEditForm(member: MemberDetail | MemberListItem): EditMemberInput {
  const profile = getMemberProfileFields(member);

  return {
    name: member.name,
    phone: member.canEditIdentity ? member.phone ?? "" : "",
    gender: member.gender ?? "UNKNOWN",
    birthDate: member.birthDate ?? undefined,
    storeId: member.storeId,
    ownerEmployeeId: member.ownerEmployeeId,
    education: profile.education ?? "",
    heightCm: profile.heightCm ?? undefined,
    weightKg: profile.weightKg ?? undefined,
    maritalStatus: profile.maritalStatus ?? "",
    occupation: profile.occupation ?? "",
    incomeRange: profile.incomeRange ?? "",
    hometownProvince: profile.hometownProvince ?? "",
    hometownCity: profile.hometownCity ?? "",
    hometownDistrict: profile.hometownDistrict ?? "",
    currentProvince: profile.currentProvince ?? "",
    currentDistrict: profile.currentDistrict ?? "",
    housingStatus: profile.housingStatus ?? "",
    vehicleStatus: profile.vehicleStatus ?? "",
    selfDescription: profile.selfDescription ?? "",
    status: member.status,
  };
}

function validateMemberForm(form: CreateMemberInput): MemberFormErrors {
  const errors: MemberFormErrors = {};
  const name = form.name.trim();

  if (!name) {
    errors.name = "请填写会员姓名。";
  } else if (name.length < 2 || name.length > 30) {
    errors.name = "姓名须为 2 至 30 个字符。";
  } else if (!memberNamePattern.test(name)) {
    errors.name = "姓名仅支持文字、空格和 ·.'。";
  }

  if (form.phone && !mainlandMobilePattern.test(form.phone)) {
    errors.phone = "请输入 11 位大陆手机号，且应以 1 开头。";
  }

  if (form.birthDate && !isEligibleBirthDate(form.birthDate)) {
    errors.birthDate = "年龄须在 18 至 80 周岁之间。";
  }

  if (form.heightCm !== undefined && (!Number.isInteger(form.heightCm) || form.heightCm < 120 || form.heightCm > 230)) {
    errors.heightCm = "身高须为 120 至 230 厘米的整数。";
  }

  if (form.weightKg !== undefined && (!Number.isInteger(form.weightKg) || form.weightKg < 30 || form.weightKg > 200)) {
    errors.weightKg = "体重须为 30 至 200 千克的整数。";
  }

  return errors;
}

function getBirthDateBounds() {
  const today = new Date();
  const formatDateInput = (date: Date) => date.toISOString().slice(0, 10);
  const min = new Date(Date.UTC(today.getUTCFullYear() - 80, today.getUTCMonth(), today.getUTCDate()));
  const max = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));

  return { min: formatDateInput(min), max: formatDateInput(max) };
}

function isEligibleBirthDate(value: string) {
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return false;
  }

  const birthDate = new Date(`${datePart}T00:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== datePart) {
    return false;
  }

  const today = new Date();
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const birthdayThisYear = new Date(Date.UTC(today.getUTCFullYear(), birthDate.getUTCMonth(), birthDate.getUTCDate()));
  if (today < birthdayThisYear) {
    age -= 1;
  }

  return age >= 18 && age <= 80;
}

function labelOf(options: { value: string; label: string }[], value: string | undefined) {
  if (!value) {
    return undefined;
  }

  return options.find((option) => option.value === value)?.label;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatError(error: unknown) {
  if (error instanceof ApiError) {
    const message = withDatabaseHint(error.message);
    return error.requestId ? `${message}（请求 ${error.requestId}）` : message;
  }

  if (error instanceof Error) {
    return withDatabaseHint(error.message);
  }

  return "请求异常，请稍后重试";
}

function withDatabaseHint(message: string) {
  if (/fetch|Failed|Network|Prisma|database|ECONNREFUSED|P10\d{2}|接口未返回/i.test(message)) {
    return `${message}。如当前环境没有真实数据库，请配置数据库并运行 pnpm seed 后重试。`;
  }

  return message;
}
