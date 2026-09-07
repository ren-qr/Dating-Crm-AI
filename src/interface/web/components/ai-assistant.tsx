"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Image from "next/image";

import {
  AiAssistantConfig,
  AiChatMessage,
  AiChatResponse,
  fetchAreaNames,
  fetchAiConfig,
  sendAiChat,
} from "@/interface/chat/client/ai-client";
import { ApiError } from "@/interface/shared/client/api-client";

const MATCHMAKER_IMAGE = "/assets/ai-matchmaker.png";
const DEFAULT_GREETING = "你好，我是 AI 红娘助手。请告诉我你希望一起梳理什么。";

type UiMessage = AiChatMessage & {
  id: string;
  createdAt: string;
  result?: AiChatResponse["displayResult"];
  clarification?: AiChatResponse["clarification"];
};

export function AiAssistantPage() {
  return (
    <section className="min-h-[calc(100vh-140px)] rounded-md border border-zinc-200 bg-white">
      <AiConversationSurface variant="page" />
    </section>
  );
}

export function AiAssistantFloatingEntry() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="fixed bottom-5 right-5 z-30 flex h-16 w-16 items-center justify-center rounded-full border border-rose-200 bg-white shadow-lg shadow-zinc-900/15 transition hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2"
        onClick={() => setOpen(true)}
        aria-label="打开 AI 助理"
      >
        <Image src={MATCHMAKER_IMAGE} alt="" width={56} height={56} className="h-14 w-14 rounded-full object-cover" />
        <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-white bg-red-500" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-zinc-950/25 lg:left-[240px]" role="dialog" aria-modal="true" aria-label="AI 助理会话抽屉">
          <button className="hidden flex-1 cursor-default lg:block" type="button" aria-label="关闭 AI 助理" onClick={() => setOpen(false)} />
          <aside className="flex h-full w-full flex-col bg-white shadow-2xl sm:w-[420px]">
            <AiConversationSurface variant="drawer" onClose={() => setOpen(false)} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

function AiConversationSurface({ variant, onClose }: { variant: "page" | "drawer"; onClose?: () => void }) {
  const [config, setConfig] = useState<AiAssistantConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>(() => [makeMessage("assistant", DEFAULT_GREETING)]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [activeFilters, setActiveFilters] = useState<Record<string, unknown> | null>(null);
  const [filterAreaNames, setFilterAreaNames] = useState<Record<string, string>>({});
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let ignore = false;

    async function loadConfig() {
      setConfigLoading(true);
      setConfigError(null);

      try {
        const nextConfig = await fetchAiConfig();
        if (!ignore) {
          setConfig(nextConfig);
          if (nextConfig.greeting) {
            setMessages([makeMessage("assistant", nextConfig.greeting)]);
          }
        }
      } catch (error) {
        if (!ignore) {
          setConfigError(formatAiError(error));
        }
      } finally {
        if (!ignore) {
          setConfigLoading(false);
        }
      }
    }

    loadConfig();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    const codes = Object.entries(activeFilters ?? {}).filter(([key, value]) => /(?:Province|City|District)Code$/u.test(key) && typeof value === "string").map(([, value]) => value as string);
    void fetchAreaNames([...new Set(codes)]).then(setFilterAreaNames).catch(() => setFilterAreaNames({}));
  }, [activeFilters]);

  async function submitMessage(event?: FormEvent<HTMLFormElement>, preset?: string) {
    event?.preventDefault();
    const content = (preset ?? input).trim();
    if (!content || sending) return;

    const userMessage = makeMessage("user", content);
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setChatError(null);

    try {
      const result = await sendAiChat({
        conversationId,
        message: content,
      });
      setConversationId(result.conversationId ?? conversationId);
      setActiveFilters(result.state?.activeFilters ?? null);
      setMessages((current) => [
        ...current,
        makeMessage("assistant", result.message?.content ?? result.content ?? "我已收到请求，但接口暂未返回可展示内容。", result),
      ]);
    } catch (error) {
      setChatError(formatAiError(error));
      setMessages((current) => current.filter((message) => message.id !== userMessage.id));
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  async function chooseClarification(message: UiMessage, answer: string) {
    if (!message.clarification || sending || !answer.trim()) return;
    setSending(true);
    setChatError(null);
    try {
      const result = await sendAiChat({ message: answer, conversationId, clarificationId: message.clarification.id, clarificationAnswer: answer });
      setConversationId(result.conversationId ?? conversationId);
      setActiveFilters(result.state?.activeFilters ?? null);
      setMessages((current) => [...current, makeMessage("assistant", result.message?.content ?? result.content ?? "已处理。", result)]);
    } catch (error) {
      setChatError(formatAiError(error));
    } finally {
      setSending(false);
    }
  }

  const compact = variant === "drawer";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className={`flex items-center justify-between border-b border-zinc-200 ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
        <div className="flex min-w-0 items-center gap-3">
          <Image src={MATCHMAKER_IMAGE} alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-full border border-rose-100 object-cover" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">AI 助理</h2>
            <p className="truncate text-xs text-zinc-500">
              {configLoading ? "正在读取助手配置..." : config?.modelLabel ?? "门店婚恋运营助手"}
            </p>
          </div>
        </div>
        {onClose ? (
          <button className="h-9 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50" type="button" onClick={onClose}>
            关闭
          </button>
        ) : null}
      </header>

      {configError ? <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">{configError}</div> : null}
      {chatError ? <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{chatError}</div> : null}

      {activeFilters && Object.keys(activeFilters).length > 0 ? (
        <div className="flex items-center gap-2 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-2 text-xs text-zinc-600">
          <span className="shrink-0 font-medium text-zinc-800">当前筛选</span>
          {Object.entries(activeFilters).filter(([key]) => !["page", "pageSize"].includes(key)).map(([key, value]) => (
            <span key={key} className="shrink-0 rounded border border-zinc-200 bg-zinc-50 px-2 py-1">{formatFilter(key, value, filterAreaNames)}</span>
          ))}
          <button type="button" className="ml-auto shrink-0 text-zinc-500 hover:text-zinc-950" onClick={() => void submitMessage(undefined, "清空条件")}>清空</button>
        </div>
      ) : null}

      <div ref={listRef} className={`flex-1 space-y-3 overflow-y-auto bg-zinc-50 ${compact ? "px-4 py-4" : "px-5 py-5"}`}>
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} onClarify={(answer) => void chooseClarification(message, answer)} onProfile={(command) => void submitMessage(undefined, command)} />
        ))}
        {sending ? (
          <div className="flex justify-start">
            <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-500 shadow-sm">正在生成回复...</div>
          </div>
        ) : null}
      </div>

      <div className={`border-t border-zinc-200 bg-white ${compact ? "p-4" : "p-5"}`}>
        <form className="flex items-end gap-2" onSubmit={submitMessage}>
          <label className="sr-only" htmlFor={`ai-input-${variant}`}>输入消息</label>
          <div className="flex min-h-11 flex-1 items-start gap-2 rounded-md border border-zinc-300 px-2 py-1.5 focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500">
            <textarea
              id={`ai-input-${variant}`}
              className="min-h-7 flex-1 resize-none border-0 bg-transparent px-0 py-0 text-sm leading-7 focus:ring-0"
              rows={compact ? 2 : 3}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submitMessage();
                }
              }}
              placeholder="输入问题或任务说明..."
            />
          </div>
          <button
            className="h-11 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={sending || !input.trim()}
          >
            {sending ? "发送中" : "发送"}
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageBubble({ message, onClarify, onProfile }: { message: UiMessage; onClarify: (answer: string) => void; onProfile: (command: string) => void }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[82%] rounded-md px-3 py-2 text-sm leading-6 shadow-sm ${isUser ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-800"}`}>
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        {message.result?.items?.length ? <MemberCards result={message.result} onProfile={onProfile} /> : null}
        {message.clarification ? <ClarificationInput clarification={message.clarification} onSubmit={onClarify} /> : null}
        <p className={`mt-1 text-[10px] ${isUser ? "text-zinc-300" : "text-zinc-400"}`}>{message.createdAt}</p>
      </div>
    </div>
  );
}

function MemberCards({ result, onProfile }: { result: NonNullable<AiChatResponse["displayResult"]>; onProfile: (command: string) => void }) {
  const [areaNames, setAreaNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const codes = result.items.flatMap((item) => item.currentLocation ? [item.currentLocation.province, item.currentLocation.city, item.currentLocation.district].filter((code): code is string => Boolean(code)) : []);
    void fetchAreaNames([...new Set(codes)]).then(setAreaNames).catch(() => setAreaNames({}));
  }, [result]);
  return <div className="mt-3 space-y-2">
    {result.items.map((item, index) => <div key={item.ref} className="rounded border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-700">
      <p className="font-medium text-zinc-900">{index + 1}. {item.name || "会员"}</p>
      <p className="mt-1">{[item.age ? `${item.age} 岁` : null, formatGender(item.gender), item.occupation, item.education, formatLocation(item.currentLocation, areaNames)].filter(Boolean).join(" · ")}</p>
      {result.type === "member_list" ? <button type="button" className="mt-2 text-xs font-medium text-zinc-900 underline" onClick={() => onProfile(`第${index + 1}个看看`)}>查看资料</button> : null}
    </div>)}
  </div>;
}
function ClarificationInput({ clarification, onSubmit }: { clarification: NonNullable<AiChatResponse["clarification"]>; onSubmit: (answer: string) => void }) {
  const [value, setValue] = useState("");
  return <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
    <input className="min-w-0 flex-1 rounded border border-zinc-300 px-2 py-1 text-xs" value={value} onChange={(event) => setValue(event.target.value)} placeholder={clarification.question} />
    <button type="submit" className="rounded bg-zinc-900 px-2 py-1 text-xs text-white">确认</button>
  </form>;
}
function makeMessage(role: UiMessage["role"], content: string, result?: AiChatResponse): UiMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit" }).format(new Date()),
    result: result?.displayResult,
    clarification: result?.clarification,
  };
}
function formatGender(value: string) { return value === "MALE" ? "男" : value === "FEMALE" ? "女" : null; }
function formatLocation(value: { province: string | null; city: string | null; district: string | null } | null, areaNames: Record<string, string>) { return value ? [value.province, value.city, value.district].filter((code): code is string => typeof code === "string").map((code) => areaNames[code] ?? code).join("-") : null; }
function formatFilter(key: string, value: unknown, areaNames: Record<string, string>) { const labels: Record<string, string> = { ageMin: "最小年龄", ageMax: "最大年龄", gender: "性别", occupation: "职业", education: "学历", incomeRange: "收入范围", currentProvinceCode: "现居地", currentCityCode: "现居地", currentDistrictCode: "现居地", hometownProvinceCode: "籍贯", hometownCityCode: "籍贯", hometownDistrictCode: "籍贯" }; const shown = typeof value === "string" && areaNames[value] ? areaNames[value] : value; return `${labels[key] ?? key}: ${String(shown)}`; }

function formatAiError(error: unknown) {
  if (error instanceof ApiError) {
    return error.requestId ? `${error.message}（requestId: ${error.requestId}）` : error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "AI 助理请求失败，请稍后重试。";
}
