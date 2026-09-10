"use client";

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import type { AssistantConversationMessage } from "@/interface/shared/client/assistant";
import { sendAssistantMessages } from "@/interface/shared/client/assistant";

type AssistantViewProps = {
  messages: AssistantConversationMessage[];
  onMessagesChange: (messages: AssistantConversationMessage[]) => void;
  onOpenMember: (memberId: string) => void;
};

export function AiQueryAssistantPage(props: AssistantViewProps) {
  return (
    <section className="flex min-h-[calc(100vh-10rem)] flex-col rounded-md border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-200 px-5 py-4">
        <h2 className="text-lg font-semibold text-zinc-900">AI 助理</h2>
      </div>
      <AssistantChat {...props} className="flex-1" />
    </section>
  );
}

export function AiQueryAssistantFloatingEntry(props: AssistantViewProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button aria-label="打开 AI 助理" className="fixed bottom-5 right-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-zinc-950 text-xs font-semibold text-white shadow-lg transition hover:bg-zinc-800" type="button" onClick={() => setOpen(true)}>AI</button>
      {open ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-zinc-950/25 lg:left-[240px]" role="dialog" aria-modal="true" aria-label="AI 助理">
          <button aria-label="关闭 AI 助理" className="hidden flex-1 cursor-default lg:block" type="button" onClick={() => setOpen(false)} />
          <aside className="flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <h2 className="text-base font-semibold text-zinc-900">AI 助理</h2>
              <button aria-label="关闭 AI 助理" className="grid h-8 w-8 place-items-center rounded-md border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50" type="button" onClick={() => setOpen(false)}>X</button>
            </div>
            <AssistantChat {...props} className="flex-1" />
          </aside>
        </div>
      ) : null}
    </>
  );
}

function AssistantChat({ messages, onMessagesChange, onOpenMember, className }: AssistantViewProps & { className?: string }) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const messageInputId = useId();

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport && typeof viewport.scrollTo === "function") {
      viewport.scrollTo({ top: viewport.scrollHeight });
    }
  }, [messages, sending]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = input.trim();
    if (!content || sending) return;

    const nextMessages = [...messages, { id: createMessageId(), role: "user" as const, content }];
    onMessagesChange(nextMessages);
    setInput("");
    setSending(true);
    setError(null);
    try {
      const response = await sendAssistantMessages(nextMessages.slice(-12).map(({ role, content: message }) => ({ role, content: message })));
      onMessagesChange([...nextMessages, {
        id: createMessageId(),
        role: "assistant",
        content: response.content,
        action: response.action,
        result: response.result,
        stop: response.stop,
      }]);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "AI 助理请求失败，请稍后重试。");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`flex min-h-0 flex-col ${className ?? ""}`}>
      <div ref={viewportRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-label="对话记录">
        {messages.length === 0 ? <p className="text-sm text-zinc-500">输入消息开始对话。</p> : null}
        {messages.map((message) => <ChatMessage key={message.id} message={message} onOpenMember={onOpenMember} />)}
        {sending ? <div className="w-fit rounded-md bg-zinc-100 px-3 py-2 text-sm text-zinc-500">正在回复...</div> : null}
      </div>
      <form className="border-t border-zinc-200 p-4" onSubmit={submit}>
        {error ? <p className="mb-2 text-xs text-amber-700">{error}</p> : null}
        <label className="sr-only" htmlFor={messageInputId}>输入消息</label>
        <textarea id={messageInputId} className="min-h-20 w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500" value={input} onChange={(event) => setInput(event.target.value)} placeholder="输入消息" />
        <div className="mt-3 flex justify-end">
          <button className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={sending || !input.trim()}>发送</button>
        </div>
      </form>
    </div>
  );
}

function ChatMessage({ message, onOpenMember }: { message: AssistantConversationMessage; onOpenMember: (memberId: string) => void }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] rounded-md px-3 py-2 text-sm ${isUser ? "bg-zinc-950 text-white" : "bg-zinc-100 text-zinc-900"}`}>
        <p className="whitespace-pre-wrap leading-6">{message.content}</p>
        {message.action?.type === "query_members" && message.action.query.unresolved.length > 0 ? (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-2 py-2 text-xs text-amber-900" role="alert">
            {message.action.query.unresolved.map((item) => <p key={`${item.text}-${item.reason}`}>{item.text}：{item.reason}</p>)}
          </div>
        ) : null}
        {message.result ? <MemberResults items={message.result.items} onOpenMember={onOpenMember} /> : null}
        {message.stop ? <p className="mt-2 text-xs text-amber-700">{message.stop.message}</p> : null}
      </div>
    </div>
  );
}

function MemberResults({ items, onOpenMember }: { items: NonNullable<AssistantConversationMessage["result"]>["items"]; onOpenMember: (memberId: string) => void }) {
  return (
    <div className="mt-3 divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200 bg-white text-zinc-900">
      {items.map((member) => (
        <button key={member.id} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-zinc-50" type="button" onClick={() => onOpenMember(member.id)}>
          <span className="min-w-0">
            <span className="block truncate font-medium">{member.name}</span>
            <span className="block truncate text-xs text-zinc-500">{[member.age === null ? null : `${member.age}岁`, member.gender === "FEMALE" ? "女" : member.gender === "MALE" ? "男" : "其他", member.occupation, member.education].filter(Boolean).join(" · ")}</span>
          </span>
          <span className="shrink-0 text-xs text-zinc-500">查看</span>
        </button>
      ))}
    </div>
  );
}

function createMessageId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
