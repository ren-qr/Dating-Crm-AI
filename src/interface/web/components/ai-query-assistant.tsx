"use client";

import { FormEvent, useId, useState } from "react";

type AiQueryAssistantProps = {
  onStartQuery: (text: string) => void;
};

export function AiQueryAssistantPage({ onStartQuery }: AiQueryAssistantProps) {
  return (
    <section className="mx-auto max-w-3xl rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">AI 助理</h2>
      <p className="mt-1 text-sm text-zinc-500">会员查询</p>
      <AssistantQueryForm onStartQuery={onStartQuery} />
    </section>
  );
}

export function AiQueryAssistantFloatingEntry({ onStartQuery }: AiQueryAssistantProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        aria-label="打开 AI 助理"
        className="fixed bottom-5 right-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-zinc-950 text-xs font-semibold text-white shadow-lg transition hover:bg-zinc-800"
        type="button"
        onClick={() => setOpen(true)}
      >
        AI
      </button>
      {open ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-zinc-950/25 lg:left-[240px]" role="dialog" aria-modal="true" aria-label="AI 助理">
          <button aria-label="关闭 AI 助理" className="hidden flex-1 cursor-default lg:block" type="button" onClick={() => setOpen(false)} />
          <aside className="h-full w-full max-w-md border-l border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900">AI 助理</h2>
              <button aria-label="关闭 AI 助理" className="grid h-8 w-8 place-items-center rounded-md border border-zinc-300 text-sm font-medium text-zinc-700 hover:bg-zinc-50" type="button" onClick={() => setOpen(false)}>X</button>
            </div>
            <AssistantQueryForm onStartQuery={(text) => { setOpen(false); onStartQuery(text); }} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

function AssistantQueryForm({ onStartQuery }: AiQueryAssistantProps) {
  const [text, setText] = useState("");
  const inputId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    onStartQuery(value);
  }

  return (
    <form className="mt-5 space-y-3" onSubmit={submit}>
      <label className="sr-only" htmlFor={inputId}>会员查询条件</label>
      <textarea
        id={inputId}
        className="min-h-28 w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-500"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="例如：杭州30岁以下女生"
      />
      <div className="flex justify-end">
        <button className="h-9 rounded-md bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={!text.trim()}>
          生成筛选条件
        </button>
      </div>
    </form>
  );
}
